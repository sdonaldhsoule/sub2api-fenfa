import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { createRateLimitMiddleware, keyByIp } from '../middleware/rate-limit-middleware.js';
import { linuxDoOAuthService } from '../services/linuxdo-oauth-service.js';
import { authArtifactService } from '../services/auth-artifact-service.js';
import { sessionService } from '../services/session-service.js';
import { sessionStateService } from '../services/session-state-service.js';
import {
  distributionRiskService,
  RiskBlockedError
} from '../services/distribution-risk-service.js';
import { sub2apiClient } from '../services/sub2api-client.js';
import { welfareRepository } from '../services/checkin-service.js';
import { fail, ok } from '../utils/response.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  createCodeChallenge,
  extractLinuxDoSubjectFromEmail,
  randomBase64Url,
  signOAuthState,
  signSessionHandoff,
  toSyntheticEmail,
  verifyOAuthState,
  verifySessionHandoff
} from '../utils/oauth.js';
import { resolveAppUrl } from '../utils/url.js';

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SESSION_HANDOFF_MAX_AGE_MS = 60 * 1000;

function sanitizeRedirectPath(path: string | undefined): string {
  const value = (path ?? '').trim();
  if (!value) return '/checkin';
  if (!value.startsWith('/')) return '/checkin';
  if (value.startsWith('//')) return '/checkin';
  if (value.includes('://')) return '/checkin';
  return value;
}

function buildFrontendCallbackHash(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return query.toString();
}

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});
const sessionHandoffExchangeSchema = z.object({
  handoff: z.string().min(1, 'handoff 不能为空')
});
const sub2apiExchangeSchema = z.object({
  access_token: z.string().min(1, 'access_token 不能为空'),
  user_id: z.coerce.number().int().positive().optional(),
  redirect: z.string().optional()
});

const authRateLimit = createRateLimitMiddleware({
  bucket: 'auth',
  limit: config.WELFARE_RATE_LIMIT_AUTH_LIMIT,
  windowMs: config.WELFARE_RATE_LIMIT_AUTH_WINDOW_MS,
  keyGenerator: keyByIp,
  message: '登录相关请求过于频繁，请稍后再试'
});

export const authRouter = Router();

async function createSessionToken(input: {
  sub2apiUserId: number;
  email: string;
  username: string;
  linuxdoSubject: string | null;
  avatarUrl?: string | null;
}): Promise<string> {
  const sessionVersion = await sessionStateService.getSessionVersion(input.sub2apiUserId);
  return sessionService.sign({
    sub2apiUserId: input.sub2apiUserId,
    email: input.email,
    linuxdoSubject: input.linuxdoSubject,
    username: input.username,
    avatarUrl: input.avatarUrl ?? null,
    sessionVersion
  });
}

authRouter.get('/linuxdo/start', authRateLimit, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const issuedAt = Date.now();
  const stateId = randomBase64Url(24);
  const codeVerifier = randomBase64Url(32);
  const codeChallenge = createCodeChallenge(codeVerifier);
  const redirectPath = sanitizeRedirectPath(req.query.redirect as string | undefined);

  await authArtifactService.issueArtifact({
    artifactId: stateId,
    artifactType: 'oauth_state',
    expiresAtMs: issuedAt + OAUTH_STATE_MAX_AGE_MS
  });

  const signedState = signOAuthState(
    {
      state: stateId,
      codeVerifier,
      redirectPath,
      issuedAt
    },
    config.WELFARE_JWT_SECRET
  );

  const authorizeUrl = new URL(config.LINUXDO_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', config.LINUXDO_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', config.LINUXDO_REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', config.LINUXDO_SCOPE);
  authorizeUrl.searchParams.set('state', signedState);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  res.redirect(authorizeUrl.toString());
}));

authRouter.get('/linuxdo/callback', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const parsed = callbackQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, 'BAD_REQUEST', 'OAuth 回调参数无效');
    return;
  }

  const query = parsed.data;
  const frontendCallbackUrl = resolveAppUrl(
    config.WELFARE_FRONTEND_URL,
    'auth/callback'
  );

  const sendFrontendError = (errorCode: string, detail?: string): void => {
    frontendCallbackUrl.hash = buildFrontendCallbackHash({
      error: errorCode,
      ...(detail ? { detail } : {})
    });
    res.redirect(frontendCallbackUrl.toString());
  };

  if (query.error) {
    sendFrontendError(query.error, query.error_description);
    return;
  }

  if (!query.code || !query.state) {
    sendFrontendError('missing_params', '缺少 code 或 state');
    return;
  }

  const oauthState = verifyOAuthState(query.state, config.WELFARE_JWT_SECRET);
  if (!oauthState) {
    sendFrontendError('state_invalid', '登录状态校验失败，请重新登录');
    return;
  }

  const consumeStateResult = await authArtifactService.consumeArtifact(
    oauthState.state,
    'oauth_state'
  );
  if (consumeStateResult === 'missing') {
    sendFrontendError('state_invalid', '登录状态校验失败，请重新登录');
    return;
  }
  if (consumeStateResult === 'used') {
    sendFrontendError('state_used', '该登录状态已被使用，请重新登录');
    return;
  }
  if (consumeStateResult === 'expired' || Date.now() - oauthState.issuedAt > OAUTH_STATE_MAX_AGE_MS) {
    sendFrontendError('state_expired', '登录状态已过期，请重新登录');
    return;
  }

  try {
    const accessToken = await linuxDoOAuthService.exchangeCode(
      query.code,
      oauthState.codeVerifier
    );
    const profile = await linuxDoOAuthService.fetchUserInfo(accessToken);
    const email = toSyntheticEmail(profile.subject);
    const sub2apiUser = await sub2apiClient.findUserByEmail(email);
    if (!sub2apiUser) {
      sendFrontendError('SUB2API_USER_REQUIRED', '该 LinuxDo 账号尚未在 sub2api 注册');
      return;
    }

    try {
      await distributionRiskService.assertAccessAllowed(
        {
          sub2apiUserId: sub2apiUser.id,
          email,
          username: profile.username || sub2apiUser.username || email,
          linuxdoSubject: profile.subject
        },
        {
          source: 'linuxdo_callback',
          recheck: true
        }
      );
    } catch (error) {
      if (error instanceof RiskBlockedError) {
        sendFrontendError('RISK_BLOCKED', error.message);
        return;
      }
      throw error;
    }

    const token = await createSessionToken({
      sub2apiUserId: sub2apiUser.id,
      email,
      linuxdoSubject: profile.subject,
      username: profile.username || sub2apiUser.username || email,
      avatarUrl: profile.avatarUrl
    });

    const handoffIssuedAt = Date.now();
    const handoffId = randomBase64Url(24);

    await authArtifactService.issueArtifact({
      artifactId: handoffId,
      artifactType: 'session_handoff',
      expiresAtMs: handoffIssuedAt + SESSION_HANDOFF_MAX_AGE_MS
    });

    const handoff = signSessionHandoff(
      {
        handoffId,
        token,
        redirectPath: sanitizeRedirectPath(oauthState.redirectPath),
        issuedAt: handoffIssuedAt
      },
      config.WELFARE_JWT_SECRET
    );

    frontendCallbackUrl.hash = buildFrontendCallbackHash({
      redirect: sanitizeRedirectPath(oauthState.redirectPath),
      handoff
    });
    res.redirect(frontendCallbackUrl.toString());
  } catch (error) {
    console.error('[auth] LinuxDo OAuth 处理失败', error);
    sendFrontendError('oauth_failed', '登录流程失败，请稍后重试');
  }
}));

authRouter.post('/session-handoff/exchange', authRateLimit, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const parsed = sessionHandoffExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'BAD_REQUEST', 'session handoff 参数无效');
    return;
  }

  const handoff = verifySessionHandoff(
    parsed.data.handoff,
    config.WELFARE_JWT_SECRET
  );
  if (!handoff) {
    fail(res, 401, 'INVALID_HANDOFF', '登录交接码无效，请重新登录');
    return;
  }

  const consumeHandoffResult = await authArtifactService.consumeArtifact(
    handoff.handoffId,
    'session_handoff'
  );
  if (consumeHandoffResult === 'missing') {
    fail(res, 401, 'INVALID_HANDOFF', '登录交接码无效，请重新登录');
    return;
  }
  if (consumeHandoffResult === 'used') {
    fail(res, 401, 'HANDOFF_ALREADY_USED', '登录交接码已使用，请重新登录');
    return;
  }
  if (
    consumeHandoffResult === 'expired' ||
    Date.now() - handoff.issuedAt > SESSION_HANDOFF_MAX_AGE_MS
  ) {
    fail(res, 401, 'HANDOFF_EXPIRED', '登录交接码已过期，请重新登录');
    return;
  }

  const verifiedSession = (() => {
    try {
      return sessionService.verifySession(handoff.token);
    } catch {
      fail(res, 401, 'INVALID_HANDOFF', '登录交接码无效，请重新登录');
      return null;
    }
  })();
  if (!verifiedSession) {
    return;
  }

  const currentSessionVersion = await sessionStateService.getSessionVersion(
    verifiedSession.user.sub2apiUserId
  );
  if (verifiedSession.sessionVersion !== currentSessionVersion) {
    fail(res, 401, 'HANDOFF_INVALIDATED', '登录交接码已失效，请重新登录');
    return;
  }

  try {
    await distributionRiskService.assertAccessAllowed(verifiedSession.user, {
      source: 'session_handoff',
      recheck: true
    });
  } catch (error) {
    if (error instanceof RiskBlockedError) {
      fail(res, 403, 'RISK_BLOCKED', error.message);
      return;
    }
    throw error;
  }

  ok(res, {
    session_token: handoff.token,
    redirect: handoff.redirectPath
  });
}));

authRouter.post('/sub2api/exchange', authRateLimit, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const parsed = sub2apiExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'sub2api 换票参数无效');
    return;
  }

  const currentUser = await sub2apiClient.getCurrentUser(parsed.data.access_token);
  if (parsed.data.user_id && parsed.data.user_id !== currentUser.id) {
    fail(res, 401, 'SUB2API_USER_MISMATCH', 'sub2api 当前登录用户不匹配');
    return;
  }

  try {
    await distributionRiskService.assertAccessAllowed(
      {
        sub2apiUserId: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        linuxdoSubject: extractLinuxDoSubjectFromEmail(currentUser.email)
      },
      {
        source: 'sub2api_exchange',
        recheck: true
      }
    );
  } catch (error) {
    if (error instanceof RiskBlockedError) {
      fail(res, 403, 'RISK_BLOCKED', error.message);
      return;
    }
    throw error;
  }

  const redirect = sanitizeRedirectPath(parsed.data.redirect);
  const token = await createSessionToken({
    sub2apiUserId: currentUser.id,
    email: currentUser.email,
    username: currentUser.username,
    linuxdoSubject: extractLinuxDoSubjectFromEmail(currentUser.email)
  });

  ok(res, {
    session_token: token,
    redirect
  });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const user = req.sessionUser!;
  const isAdminByUserId = await welfareRepository.hasAdminUserId(user.sub2apiUserId);
  const isAdminByLegacySubject = user.linuxdoSubject
    ? await welfareRepository.hasLegacyAdminSubject(user.linuxdoSubject)
    : false;
  ok(res, {
    sub2api_user_id: user.sub2apiUserId,
    email: user.email,
    linuxdo_subject: user.linuxdoSubject,
    username: user.username,
    avatar_url: user.avatarUrl,
    is_admin: isAdminByUserId || isAdminByLegacySubject
  });
}));

authRouter.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');

  await sessionStateService.revokeToken(
    req.sessionTokenId!,
    req.sessionTokenExpiresAtMs!
  );

  ok(res, { message: '已退出登录' });
}));

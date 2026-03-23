import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { linuxDoOAuthService } from '../services/linuxdo-oauth-service.js';
import { sessionService } from '../services/session-service.js';
import { sub2apiClient } from '../services/sub2api-client.js';
import { welfareRepository } from '../services/checkin-service.js';
import { fail, ok } from '../utils/response.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  createCodeChallenge,
  randomBase64Url,
  signOAuthState,
  signSessionHandoff,
  toSyntheticEmail,
  verifyOAuthState,
  verifySessionHandoff
} from '../utils/oauth.js';

const COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
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

export const authRouter = Router();

authRouter.get('/linuxdo/start', (req, res) => {
  const codeVerifier = randomBase64Url(32);
  const codeChallenge = createCodeChallenge(codeVerifier);
  const redirectPath = sanitizeRedirectPath(req.query.redirect as string | undefined);
  const signedState = signOAuthState(
    {
      state: randomBase64Url(24),
      codeVerifier,
      redirectPath,
      issuedAt: Date.now()
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
});

authRouter.get('/linuxdo/callback', asyncHandler(async (req, res) => {
  const parsed = callbackQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, 'BAD_REQUEST', 'OAuth 回调参数无效');
    return;
  }

  const query = parsed.data;
  const frontendCallbackUrl = new URL('/auth/callback', config.WELFARE_FRONTEND_URL);

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

  if (Date.now() - oauthState.issuedAt > COOKIE_MAX_AGE_MS) {
    sendFrontendError('state_expired', '登录状态已过期，请重新登录');
    return;
  }

  try {
    const accessToken = await linuxDoOAuthService.exchangeCode(
      query.code,
      oauthState.codeVerifier
    );
    const profile = await linuxDoOAuthService.fetchUserInfo(accessToken);
    const syntheticEmail = toSyntheticEmail(profile.subject);

    const sub2apiUser = await sub2apiClient.findUserBySyntheticEmail(syntheticEmail);
    if (!sub2apiUser) {
      sendFrontendError('SUB2API_USER_REQUIRED', '该 LinuxDo 账号尚未在 sub2api 注册');
      return;
    }

    const token = sessionService.sign({
      sub2apiUserId: sub2apiUser.id,
      linuxdoSubject: profile.subject,
      syntheticEmail,
      username: profile.username,
      avatarUrl: profile.avatarUrl
    });

    const handoff = signSessionHandoff(
      {
        token,
        redirectPath: sanitizeRedirectPath(oauthState.redirectPath),
        issuedAt: Date.now()
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

authRouter.post('/session-handoff/exchange', (req, res) => {
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

  if (Date.now() - handoff.issuedAt > SESSION_HANDOFF_MAX_AGE_MS) {
    fail(res, 401, 'HANDOFF_EXPIRED', '登录交接码已过期，请重新登录');
    return;
  }

  ok(res, {
    session_token: handoff.token,
    redirect: handoff.redirectPath
  });
});

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = req.sessionUser!;
  const isAdmin = await welfareRepository.hasAdminSubject(user.linuxdoSubject);
  ok(res, {
    sub2api_user_id: user.sub2apiUserId,
    linuxdo_subject: user.linuxdoSubject,
    synthetic_email: user.syntheticEmail,
    username: user.username,
    avatar_url: user.avatarUrl,
    is_admin: isAdmin
  });
}));

authRouter.post('/logout', (_req, res) => {
  // 不再需要清除 session cookie，前端负责清除 localStorage 中的 token
  ok(res, { message: '已退出登录' });
});

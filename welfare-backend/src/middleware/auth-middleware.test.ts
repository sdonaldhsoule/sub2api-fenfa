import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionService } from '../services/session-service.js';
import { sessionStateService } from '../services/session-state-service.js';

process.env.DATABASE_URL ??= 'postgres://localhost:5432/test';
process.env.WELFARE_FRONTEND_URL ??= 'http://localhost:5173';
process.env.WELFARE_JWT_SECRET ??= 'test-secret-123456';
process.env.LINUXDO_CLIENT_ID ??= 'test-client-id';
process.env.LINUXDO_CLIENT_SECRET ??= 'test-client-secret';
process.env.LINUXDO_AUTHORIZE_URL ??= 'https://example.com/oauth/authorize';
process.env.LINUXDO_TOKEN_URL ??= 'https://example.com/oauth/token';
process.env.LINUXDO_USERINFO_URL ??= 'https://example.com/oauth/userinfo';
process.env.LINUXDO_REDIRECT_URI ??= 'http://localhost:8787/api/auth/linuxdo/callback';
process.env.SUB2API_BASE_URL ??= 'https://example.com';
process.env.SUB2API_ADMIN_API_KEY ??= 'test-api-key';

process.env.DATABASE_URL ??= 'postgres://localhost:5432/test';
process.env.WELFARE_FRONTEND_URL ??= 'http://localhost:5173';
process.env.WELFARE_JWT_SECRET ??= 'test-secret-123456';
process.env.LINUXDO_CLIENT_ID ??= 'test-client-id';
process.env.LINUXDO_CLIENT_SECRET ??= 'test-client-secret';
process.env.LINUXDO_AUTHORIZE_URL ??= 'https://example.com/oauth/authorize';
process.env.LINUXDO_TOKEN_URL ??= 'https://example.com/oauth/token';
process.env.LINUXDO_USERINFO_URL ??= 'https://example.com/oauth/userinfo';
process.env.LINUXDO_REDIRECT_URI ??= 'http://localhost:8787/api/auth/linuxdo/callback';
process.env.SUB2API_BASE_URL ??= 'https://example.com';
process.env.SUB2API_ADMIN_API_KEY ??= 'test-api-key';

const { mockAssertAccessAllowed } = vi.hoisted(() => ({
  mockAssertAccessAllowed: vi.fn()
}));

vi.mock('../services/session-service.js', () => ({
  sessionService: {
    verifySession: vi.fn()
  }
}));

vi.mock('../services/session-state-service.js', () => ({
  sessionStateService: {
    isTokenRevoked: vi.fn(),
    getSessionVersion: vi.fn()
  }
}));

vi.mock('../services/distribution-risk-service.js', () => ({
  distributionRiskService: {
    assertAccessAllowed: mockAssertAccessAllowed
  },
  RiskBlockedError: class extends Error {
    constructor(readonly event: unknown) {
      super('blocked');
    }
  }
}));

function createResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  } as unknown as Response;
}

describe('requireAuth', () => {
  const next = vi.fn();
  let requireAuth: typeof import('./auth-middleware.js').requireAuth;

  beforeEach(async () => {
    next.mockReset();
    vi.mocked(sessionService.verifySession).mockReset();
    vi.mocked(sessionStateService.isTokenRevoked).mockReset();
    vi.mocked(sessionStateService.getSessionVersion).mockReset();
    mockAssertAccessAllowed.mockReset();

    ({ requireAuth } = await import('./auth-middleware.js'));
  });

  it('使用 Authorization header 中的 Bearer token 进行认证', async () => {
    vi.mocked(sessionService.verifySession).mockReturnValue({
      user: {
        sub2apiUserId: 1,
        email: 'linuxdo-subject@linuxdo-connect.invalid',
        linuxdoSubject: 'subject',
        username: 'tester',
        avatarUrl: null
      },
      tokenId: 'token-id',
      expiresAtMs: 1_800_000_000_000,
      sessionVersion: 1
    });
    vi.mocked(sessionStateService.isTokenRevoked).mockResolvedValue(false);
    vi.mocked(sessionStateService.getSessionVersion).mockResolvedValue(1);
    mockAssertAccessAllowed.mockResolvedValue(undefined);

    const req = {
      header: vi.fn().mockReturnValue('Bearer header-token')
    } as unknown as Request;
    const res = createResponse();

    requireAuth(req, res, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledTimes(1);
    });

    expect(sessionService.verifySession).toHaveBeenCalledWith('header-token');
    expect(sessionStateService.isTokenRevoked).toHaveBeenCalledWith('token-id');
    expect(sessionStateService.getSessionVersion).toHaveBeenCalledWith(1);
  });

  it('在 Authorization header 缺失时返回 401', () => {
    const req = {
      header: vi.fn().mockReturnValue(undefined)
    } as unknown as Request;
    const res = createResponse();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('已撤销 token 会返回 401', async () => {
    vi.mocked(sessionService.verifySession).mockReturnValue({
      user: {
        sub2apiUserId: 1,
        email: 'linuxdo-subject@linuxdo-connect.invalid',
        linuxdoSubject: 'subject',
        username: 'tester',
        avatarUrl: null
      },
      tokenId: 'revoked-token',
      expiresAtMs: 1_800_000_000_000,
      sessionVersion: 1
    });
    vi.mocked(sessionStateService.isTokenRevoked).mockResolvedValue(true);
    vi.mocked(sessionStateService.getSessionVersion).mockResolvedValue(1);

    const req = {
      header: vi.fn().mockReturnValue('Bearer revoked')
    } as unknown as Request;
    const res = createResponse();

    requireAuth(req, res, next);

    await vi.waitFor(() => {
      expect(res.status).toHaveBeenCalledWith(401);
    });
    expect(next).not.toHaveBeenCalled();
  });
});

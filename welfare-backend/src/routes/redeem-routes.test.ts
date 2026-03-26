import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const {
  mockRedeemService,
  ConflictError,
  ForbiddenError,
  NotFoundError
} = vi.hoisted(() => ({
  mockRedeemService: {
    getHistory: vi.fn(),
    redeem: vi.fn()
  },
  ConflictError: class extends Error {},
  ForbiddenError: class extends Error {},
  NotFoundError: class extends Error {}
}));

vi.mock('../middleware/auth-middleware.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.sessionUser = {
      sub2apiUserId: 1,
      linuxdoSubject: 'subject',
      syntheticEmail: 'linuxdo-subject@linuxdo-connect.invalid',
      username: 'tester',
      avatarUrl: null
    };
    next();
  }
}));

vi.mock('../services/redeem-service.js', () => ({
  redeemService: mockRedeemService,
  ConflictError,
  ForbiddenError,
  NotFoundError
}));

async function createTestApp() {
  const { redeemRouter } = await import('./redeem-routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/redeem-codes', redeemRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      code: 500,
      message: 'INTERNAL_ERROR',
      detail: error instanceof Error ? error.message : 'unknown error'
    });
  });
  return app;
}

describe('redeemRouter', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRedeemService.getHistory.mockReset();
    mockRedeemService.redeem.mockReset();
  });

  it('POST /redeem 在兑换码不存在时返回 404', async () => {
    mockRedeemService.redeem.mockRejectedValue(new NotFoundError('兑换码不存在'));

    const app = await createTestApp();
    const response = await request(app)
      .post('/api/redeem-codes/redeem')
      .send({ code: 'NOPE' });

    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.message).toBe('REDEEM_CODE_NOT_FOUND');
  });

  it('POST /redeem 在上游发放失败时返回 502', async () => {
    const { HttpError } = await import('../utils/http.js');
    mockRedeemService.redeem.mockRejectedValue(new HttpError(502, 'bad gateway'));

    const app = await createTestApp();
    const response = await request(app)
      .post('/api/redeem-codes/redeem')
      .send({ code: 'WELCOME100' });

    expect(response.status).toBe(502);
    expect(response.body.message).toBe('SUB2API_GRANT_FAILED');
  });

  it('POST /redeem 在上游返回业务失败时同样返回 502', async () => {
    const { Sub2apiResponseError } = await import('../services/sub2api-client.js');
    mockRedeemService.redeem.mockRejectedValue(new Sub2apiResponseError('quota locked'));

    const app = await createTestApp();
    const response = await request(app)
      .post('/api/redeem-codes/redeem')
      .send({ code: 'WELCOME100' });

    expect(response.status).toBe(502);
    expect(response.body.message).toBe('SUB2API_GRANT_FAILED');
  });
});

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
  mockCheckinService,
  ConflictError,
  ForbiddenError
} = vi.hoisted(() => ({
  mockCheckinService: {
    getStatus: vi.fn(),
    getHistory: vi.fn(),
    checkin: vi.fn(),
    checkBlindbox: vi.fn()
  },
  ConflictError: class extends Error {},
  ForbiddenError: class extends Error {}
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

vi.mock('../services/checkin-service.js', () => ({
  checkinService: mockCheckinService,
  ConflictError,
  ForbiddenError
}));

async function createTestApp() {
  const { checkinRouter } = await import('./checkin-routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/checkin', checkinRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      code: 500,
      message: 'INTERNAL_ERROR',
      detail: error instanceof Error ? error.message : 'unknown error'
    });
  });
  return app;
}

describe('checkinRouter', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCheckinService.getStatus.mockReset();
    mockCheckinService.getHistory.mockReset();
    mockCheckinService.checkin.mockReset();
    mockCheckinService.checkBlindbox.mockReset();
  });

  it('GET /status 返回签到状态', async () => {
    mockCheckinService.getStatus.mockResolvedValue({
      checkin_enabled: true,
      can_checkin_normal: true,
      can_checkin_blindbox: true
    });

    const app = await createTestApp();
    const response = await request(app).get('/api/checkin/status');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual(
      expect.objectContaining({
        checkin_enabled: true,
        can_checkin_normal: true
      })
    );
  });

  it('POST / 在签到冲突时返回 409', async () => {
    mockCheckinService.checkin.mockRejectedValue(new ConflictError('今日已签到'));

    const app = await createTestApp();
    const response = await request(app).post('/api/checkin');

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('CHECKIN_CONFLICT');
  });

  it('POST / 在上游发放失败时返回 502', async () => {
    const { HttpError } = await import('../utils/http.js');
    mockCheckinService.checkin.mockRejectedValue(new HttpError(502, 'bad gateway'));

    const app = await createTestApp();
    const response = await request(app).post('/api/checkin');

    expect(response.status).toBe(502);
    expect(response.body.message).toBe('SUB2API_GRANT_FAILED');
  });

  it('POST / 在上游返回业务失败时同样返回 502', async () => {
    const { Sub2apiResponseError } = await import('../services/sub2api-client.js');
    mockCheckinService.checkin.mockRejectedValue(new Sub2apiResponseError('quota locked'));

    const app = await createTestApp();
    const response = await request(app).post('/api/checkin');

    expect(response.status).toBe(502);
    expect(response.body.message).toBe('SUB2API_GRANT_FAILED');
  });

  it('POST /blindbox 会调用盲盒签到服务并返回结果', async () => {
    mockCheckinService.checkBlindbox.mockResolvedValue({
      checkin_date: '2026-03-26',
      checkin_mode: 'blindbox',
      blindbox_item_id: 3,
      blindbox_title: '好运签',
      reward_balance: 15,
      new_balance: 120,
      grant_status: 'success'
    });

    const app = await createTestApp();
    const response = await request(app).post('/api/checkin/blindbox');

    expect(response.status).toBe(200);
    expect(response.body.data.checkin_mode).toBe('blindbox');
    expect(response.body.data.blindbox_title).toBe('好运签');
  });
});

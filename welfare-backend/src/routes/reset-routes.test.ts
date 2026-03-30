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
  mockResetService,
  ConflictError,
  ForbiddenError,
  NotFoundError
} = vi.hoisted(() => ({
  mockResetService: {
    getStatus: vi.fn(),
    getHistory: vi.fn(),
    apply: vi.fn()
  },
  ConflictError: class extends Error {},
  ForbiddenError: class extends Error {},
  NotFoundError: class extends Error {}
}));

vi.mock('../middleware/auth-middleware.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.sessionUser = {
      sub2apiUserId: 7,
      email: 'tester@example.com',
      linuxdoSubject: 'subject',
      username: 'tester',
      avatarUrl: null
    };
    next();
  }
}));

vi.mock('../services/reset-service.js', () => ({
  resetService: mockResetService,
  ConflictError,
  ForbiddenError,
  NotFoundError
}));

async function createTestApp() {
  const { resetRouter } = await import('./reset-routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/reset', resetRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      code: 500,
      message: 'INTERNAL_ERROR',
      detail: error instanceof Error ? error.message : 'unknown error'
    });
  });
  return app;
}

describe('resetRouter', () => {
  beforeEach(() => {
    vi.resetModules();
    mockResetService.getStatus.mockReset();
    mockResetService.getHistory.mockReset();
    mockResetService.apply.mockReset();
  });

  it('GET /status 返回重置状态', async () => {
    mockResetService.getStatus.mockResolvedValue({
      reset_enabled: true,
      current_balance: 12,
      threshold_balance: 20,
      target_balance: 200,
      cooldown_days: 7,
      notice: '余额低于阈值时可直接重置',
      can_apply: true,
      reason: '',
      next_available_at: null,
      latest_record: null
    });

    const app = await createTestApp();
    const response = await request(app).get('/api/reset/status');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.current_balance).toBe(12);
  });

  it('POST /apply 在业务冲突时返回 409', async () => {
    mockResetService.apply.mockRejectedValue(new ConflictError('重置冷却中'));

    const app = await createTestApp();
    const response = await request(app).post('/api/reset/apply');

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('RESET_CONFLICT');
  });

  it('POST /apply 在功能关闭时返回 403', async () => {
    mockResetService.apply.mockRejectedValue(new ForbiddenError('额度重置暂未开放'));

    const app = await createTestApp();
    const response = await request(app).post('/api/reset/apply');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('RESET_DISABLED');
  });

  it('POST /apply 在找不到用户时返回 404', async () => {
    mockResetService.apply.mockRejectedValue(new NotFoundError('sub2api 用户不存在'));

    const app = await createTestApp();
    const response = await request(app).post('/api/reset/apply');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('NOT_FOUND');
  });
});

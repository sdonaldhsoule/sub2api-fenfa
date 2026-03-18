import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function applyBaseEnv() {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    PORT: '8787',
    DATABASE_URL: 'postgres://localhost:5432/test',
    WELFARE_FRONTEND_URL: 'http://localhost:5173',
    WELFARE_CORS_ORIGINS: 'http://localhost:5173',
    WELFARE_JWT_SECRET: 'test-secret-123456',
    WELFARE_JWT_EXPIRES_IN: '7d',
    WELFARE_COOKIE_SECURE: 'false',
    WELFARE_SESSION_COOKIE_SAME_SITE: 'lax',
    LINUXDO_CLIENT_ID: 'client-id',
    LINUXDO_CLIENT_SECRET: 'client-secret',
    LINUXDO_AUTHORIZE_URL: 'https://example.com/oauth/authorize',
    LINUXDO_TOKEN_URL: 'https://example.com/oauth/token',
    LINUXDO_USERINFO_URL: 'https://example.com/oauth/userinfo',
    LINUXDO_REDIRECT_URI: 'http://localhost:8787/api/auth/linuxdo/callback',
    LINUXDO_SCOPE: 'user',
    SUB2API_BASE_URL: 'https://example.com',
    SUB2API_ADMIN_API_KEY: 'api-key',
    SUB2API_TIMEOUT_MS: '10000',
    DEFAULT_CHECKIN_ENABLED: 'true',
    DEFAULT_DAILY_REWARD: '10',
    DEFAULT_TIMEZONE: 'Asia/Shanghai',
    BOOTSTRAP_ADMIN_SUBJECTS: ''
  };
}

describe('config', () => {
  beforeEach(() => {
    applyBaseEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('parses jwt duration into cookie max age', async () => {
    process.env.WELFARE_JWT_EXPIRES_IN = '1.5h';

    const { config } = await import('./config.js');

    expect(config.WELFARE_JWT_MAX_AGE_MS).toBe(5_400_000);
  });

  it('rejects misspelled boolean env values', async () => {
    process.env.WELFARE_COOKIE_SECURE = 'ture';

    await expect(import('./config.js')).rejects.toThrow('环境变量校验失败');
  });
});

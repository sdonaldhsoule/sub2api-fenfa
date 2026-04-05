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
    BOOTSTRAP_ADMIN_SUBJECTS: '',
    BOOTSTRAP_ADMIN_EMAILS: ''
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

  it('accepts valid duration strings', async () => {
    process.env.WELFARE_JWT_EXPIRES_IN = '1.5h';
    process.env.WELFARE_REVOKED_TOKEN_CLEANUP_INTERVAL = '30m';
    process.env.WELFARE_MONITOR_SCAN_INTERVAL = '3m';
    process.env.WELFARE_MONITOR_SNAPSHOT_INTERVAL = '45m';
    process.env.WELFARE_MONITOR_LOCK_DURATION = '36h';
    process.env.WELFARE_MONITOR_LIVE_CACHE_TTL = '45s';
    process.env.WELFARE_RATE_LIMIT_AUTH_WINDOW = '15m';

    const { config } = await import('./config.js');

    expect(config.WELFARE_JWT_EXPIRES_IN).toBe('1.5h');
    expect(config.WELFARE_REVOKED_TOKEN_CLEANUP_INTERVAL_MS).toBe(1_800_000);
    expect(config.WELFARE_MONITOR_SCAN_INTERVAL_MS).toBe(180_000);
    expect(config.WELFARE_MONITOR_SNAPSHOT_INTERVAL_MS).toBe(2_700_000);
    expect(config.WELFARE_MONITOR_LOCK_DURATION_MS).toBe(129_600_000);
    expect(config.WELFARE_MONITOR_LIVE_CACHE_TTL_MS).toBe(45_000);
    expect(config.WELFARE_RATE_LIMIT_AUTH_WINDOW_MS).toBe(900_000);
  });

  it('rejects invalid default timezone values', async () => {
    process.env.DEFAULT_TIMEZONE = 'Not/A_Real_Timezone';

    await expect(import('./config.js')).rejects.toThrow('DEFAULT_TIMEZONE');
  });

  it('rejects invalid bootstrap admin subjects', async () => {
    process.env.BOOTSTRAP_ADMIN_SUBJECTS = 'good_subject,bad subject';

    await expect(import('./config.js')).rejects.toThrow(
      'BOOTSTRAP_ADMIN_SUBJECTS 包含非法 subject'
    );
  });

  it('rejects invalid bootstrap admin emails', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAILS = 'good@example.com,not-an-email';

    await expect(import('./config.js')).rejects.toThrow(
      'BOOTSTRAP_ADMIN_EMAILS 包含非法邮箱'
    );
  });

  it('rejects invalid monitoring threshold combinations', async () => {
    process.env.WELFARE_MONITOR_OBSERVE_IP_THRESHOLD = '6';
    process.env.WELFARE_MONITOR_BLOCK_IP_THRESHOLD = '6';

    await expect(import('./config.js')).rejects.toThrow(
      'WELFARE_MONITOR_BLOCK_IP_THRESHOLD 必须大于 WELFARE_MONITOR_OBSERVE_IP_THRESHOLD'
    );
  });
});

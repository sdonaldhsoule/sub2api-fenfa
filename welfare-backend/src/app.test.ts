import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };
let staticDir = '';

function applyBaseEnv() {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    PORT: '8787',
    DATABASE_URL: 'postgres://localhost:5432/test',
    WELFARE_FRONTEND_URL: 'http://localhost:5173',
    WELFARE_CORS_ORIGINS: 'http://localhost:5173',
    WELFARE_JWT_SECRET: 'test-secret-123456',
    WELFARE_JWT_EXPIRES_IN: '12h',
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
    BOOTSTRAP_ADMIN_USER_IDS: '',
    BOOTSTRAP_ADMIN_SUBJECTS: '',
    BOOTSTRAP_ADMIN_EMAILS: '',
    WELFARE_STATIC_DIR: staticDir
  };
}

describe('createApp', () => {
  beforeEach(async () => {
    staticDir = await mkdtemp(path.join(os.tmpdir(), 'welfare-static-'));
    await writeFile(
      path.join(staticDir, 'index.html'),
      '<!doctype html><html><body>frontend-shell</body></html>'
    );
    applyBaseEnv();
    vi.resetModules();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.resetModules();
    await rm(staticDir, { recursive: true, force: true });
    staticDir = '';
  });

  it('在存在前端构建产物时为页面路由返回 index.html', async () => {
    const { createApp } = await import('./app.js');

    const response = await request(createApp())
      .get('/checkin')
      .set('Accept', 'text/html')
      .expect(200);

    expect(response.text).toContain('frontend-shell');
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('不会把未命中的 API 请求回退到前端页面', async () => {
    const { createApp } = await import('./app.js');

    const response = await request(createApp())
      .get('/api/unknown')
      .set('Accept', 'application/json')
      .expect(404);

    expect(response.body.message).toBe('NOT_FOUND');
  });
});

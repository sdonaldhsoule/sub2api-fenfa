import { describe, expect, it } from 'vitest';

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

describe('buildMonitoringAggregateIndex', () => {
  it('按用户和 IP 聚合 1h / 24h 数据', async () => {
    const { buildMonitoringAggregateIndex } = await import('./monitoring-service.js');
    const result = buildMonitoringAggregateIndex({
      entries: [
        {
          userId: 1,
          email: 'u1@example.com',
          username: 'u1',
          linuxdoSubject: null,
          role: 'user',
          status: 'active',
          ipAddress: '1.1.1.1',
          createdAt: '2026-04-05T09:50:00.000Z',
          createdAtMs: Date.parse('2026-04-05T09:50:00.000Z')
        },
        {
          userId: 1,
          email: 'u1@example.com',
          username: 'u1',
          linuxdoSubject: null,
          role: 'user',
          status: 'active',
          ipAddress: '2.2.2.2',
          createdAt: '2026-04-05T09:55:00.000Z',
          createdAtMs: Date.parse('2026-04-05T09:55:00.000Z')
        },
        {
          userId: 2,
          email: 'u2@example.com',
          username: 'u2',
          linuxdoSubject: null,
          role: 'user',
          status: 'active',
          ipAddress: '2.2.2.2',
          createdAt: '2026-04-05T09:58:00.000Z',
          createdAtMs: Date.parse('2026-04-05T09:58:00.000Z')
        }
      ],
      nowMs: Date.parse('2026-04-05T10:00:00.000Z'),
      observeIpThreshold: 2,
      blockIpThreshold: 3,
      openRiskEvents: [
        {
          id: 9,
          sub2apiUserId: 1,
          status: 'active'
        }
      ],
      protectedUsers: {
        protectedUserIds: new Set<number>(),
        protectedSubjects: new Set<string>()
      }
    });

    expect(result.summary.requestCount24h).toBe(3);
    expect(result.summary.observeUserCount1h).toBe(1);
    expect(result.summary.sharedIpCount1h).toBe(1);
    expect(result.users[0]?.sub2apiUserId).toBe(1);
    expect(result.users[0]?.riskStatus).toBe('active');
    expect(result.ips[0]?.ipAddress).toBe('2.2.2.2');
    expect(result.ips[0]?.userCount24h).toBe(2);
  });
});

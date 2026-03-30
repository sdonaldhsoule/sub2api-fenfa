import { describe, expect, it, vi } from 'vitest';

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

const { WelfareRepository } = await import('./welfare-repository.js');

describe('WelfareRepository', () => {
  it('createCheckinPending 会把幂等键作为独立参数写入 SQL', async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          id: 1,
          sub2api_user_id: 42,
          sub2api_email: 'user@example.com',
          sub2api_username: 'tester',
          linuxdo_subject: 'linuxdo-42',
          checkin_date: '2026-03-30',
          checkin_mode: 'normal',
          blindbox_item_id: null,
          blindbox_title: '',
          reward_balance: '10',
          idempotency_key: 'welfare-checkin:normal:42:2026-03-30',
          grant_status: 'pending',
          grant_error: '',
          sub2api_request_id: '',
          created_at: '2026-03-30T00:00:00.000Z',
          updated_at: '2026-03-30T00:00:00.000Z'
        }
      ]
    });

    const repository = new WelfareRepository({ query } as never);

    await repository.createCheckinPending({
      sub2apiUserId: 42,
      sub2apiEmail: 'user@example.com',
      sub2apiUsername: 'tester',
      linuxdoSubject: 'linuxdo-42',
      checkinDate: '2026-03-30',
      checkinMode: 'normal',
      blindboxItemId: null,
      blindboxTitle: '',
      rewardBalance: 10,
      idempotencyKey: 'welfare-checkin:normal:42:2026-03-30'
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain(
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')"
    );
    expect(params).toEqual([
      42,
      'user@example.com',
      'tester',
      'linuxdo-42',
      '2026-03-30',
      'normal',
      null,
      '',
      10,
      'welfare-checkin:normal:42:2026-03-30'
    ]);
  });
});

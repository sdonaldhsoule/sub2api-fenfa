import { describe, expect, it, vi } from 'vitest';
import { RedeemRepository } from './redeem-repository.js';

describe('RedeemRepository', () => {
  it('createRedeemClaimPending 会把幂等键作为独立参数写入 SQL', async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          id: 9,
          redeem_code_id: 3,
          sub2api_user_id: 42,
          sub2api_email: 'user@example.com',
          sub2api_username: 'tester',
          linuxdo_subject: 'linuxdo-42',
          redeem_code: 'SPRING2026',
          redeem_title: '春季福利',
          reward_balance: '88',
          idempotency_key: 'welfare-redeem:3:42',
          grant_status: 'pending',
          grant_error: '',
          sub2api_request_id: '',
          created_at: '2026-03-30T00:00:00.000Z',
          updated_at: '2026-03-30T00:00:00.000Z'
        }
      ]
    });

    const repository = new RedeemRepository({ query } as never);

    await repository.createRedeemClaimPending({
      redeemCodeId: 3,
      sub2apiUserId: 42,
      sub2apiEmail: 'user@example.com',
      sub2apiUsername: 'tester',
      linuxdoSubject: 'linuxdo-42',
      redeemCode: 'SPRING2026',
      redeemTitle: '春季福利',
      rewardBalance: 88,
      idempotencyKey: 'welfare-redeem:3:42'
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain(
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')"
    );
    expect(params).toEqual([
      3,
      42,
      'user@example.com',
      'tester',
      'linuxdo-42',
      'SPRING2026',
      '春季福利',
      88,
      'welfare-redeem:3:42'
    ]);
  });
});

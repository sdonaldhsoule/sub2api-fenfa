import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckinRecord } from '../types/domain.js';

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

const { CheckinService, ConflictError, NotFoundError } = await import('./checkin-service.js');

function createRepositoryMock() {
  return {
    getSettings: vi.fn(),
    getCheckinByDate: vi.fn(),
    getCheckinById: vi.fn(),
    createCheckinPending: vi.fn(),
    markCheckinPendingRetry: vi.fn(),
    claimStalePending: vi.fn(),
    markCheckinSuccess: vi.fn(),
    markCheckinFailed: vi.fn(),
    listUserCheckins: vi.fn(),
    updateSettings: vi.fn(),
    getDailyStats: vi.fn(),
    getActiveUserCount: vi.fn(),
    queryAdminCheckins: vi.fn()
  };
}

function createSub2apiMock() {
  return {
    addUserBalance: vi.fn()
  };
}

function createFailedRecord(): CheckinRecord {
  return {
    id: 7,
    sub2apiUserId: 42,
    linuxdoSubject: 'linuxdo-user',
    syntheticEmail: 'linuxdo-user@linuxdo-connect.invalid',
    checkinDate: '2026-03-06',
    rewardBalance: 10,
    idempotencyKey: 'welfare-checkin:42:2026-03-06',
    grantStatus: 'failed',
    grantError: 'network timeout',
    sub2apiRequestId: '',
    createdAt: '2026-03-06T10:00:00.000Z',
    updatedAt: '2026-03-06T10:00:00.000Z'
  };
}

describe('checkin service retryFailedCheckin', () => {
  const repository = createRepositoryMock();
  const sub2api = createSub2apiMock();
  const service = new CheckinService(repository, sub2api);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功重试失败签到并返回更新后的记录', async () => {
    const failedRecord = createFailedRecord();
    const pendingRecord: CheckinRecord = {
      ...failedRecord,
      grantStatus: 'pending',
      grantError: ''
    };
    const successRecord: CheckinRecord = {
      ...failedRecord,
      grantStatus: 'success',
      grantError: '',
      sub2apiRequestId: 'req-123'
    };

    repository.getCheckinById
      .mockResolvedValueOnce(failedRecord)
      .mockResolvedValueOnce(successRecord);
    repository.markCheckinPendingRetry.mockResolvedValue(pendingRecord);
    repository.markCheckinSuccess.mockResolvedValue(undefined);
    sub2api.addUserBalance.mockResolvedValue({
      newBalance: 88,
      requestId: 'req-123'
    });

    const result = await service.retryFailedCheckin(failedRecord.id);

    expect(repository.markCheckinPendingRetry).toHaveBeenCalledWith(
      failedRecord.id
    );
    expect(sub2api.addUserBalance).toHaveBeenCalledWith({
      userId: failedRecord.sub2apiUserId,
      amount: failedRecord.rewardBalance,
      notes: `福利签到 ${failedRecord.checkinDate}`,
      idempotencyKey: failedRecord.idempotencyKey
    });
    expect(repository.markCheckinSuccess).toHaveBeenCalledWith(failedRecord.id, 'req-123');
    expect(result).toEqual({
      item: successRecord,
      new_balance: 88
    });
  });

  it('记录不存在时抛出 NotFoundError', async () => {
    repository.getCheckinById.mockResolvedValue(null);

    await expect(service.retryFailedCheckin(999)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.markCheckinPendingRetry).not.toHaveBeenCalled();
    expect(sub2api.addUserBalance).not.toHaveBeenCalled();
  });

  it('补发失败时会回写失败状态并继续抛错', async () => {
    const failedRecord = createFailedRecord();
    const pendingRecord: CheckinRecord = {
      ...failedRecord,
      grantStatus: 'pending',
      grantError: ''
    };

    repository.getCheckinById.mockResolvedValue(failedRecord);
    repository.markCheckinPendingRetry.mockResolvedValue(pendingRecord);
    repository.markCheckinFailed.mockResolvedValue(undefined);
    sub2api.addUserBalance.mockRejectedValue(new Error('upstream unavailable'));

    await expect(service.retryFailedCheckin(failedRecord.id)).rejects.toThrow(
      'upstream unavailable'
    );
    expect(repository.markCheckinFailed).toHaveBeenCalledWith(
      failedRecord.id,
      'upstream unavailable'
    );
  });

  it('成功状态不允许重复补发', async () => {
    repository.getCheckinById.mockResolvedValue({
      ...createFailedRecord(),
      grantStatus: 'success',
      grantError: ''
    } satisfies CheckinRecord);

    await expect(service.retryFailedCheckin(7)).rejects.toBeInstanceOf(ConflictError);
    expect(repository.markCheckinPendingRetry).not.toHaveBeenCalled();
  });

  it('普通签到重试失败记录时保留原始奖励值', async () => {
    const failedRecord = createFailedRecord();
    const pendingRecord: CheckinRecord = {
      ...failedRecord,
      grantStatus: 'pending',
      grantError: ''
    };

    repository.getSettings.mockResolvedValue({
      checkinEnabled: true,
      dailyRewardBalance: 20,
      timezone: 'Asia/Shanghai'
    });
    repository.createCheckinPending.mockResolvedValue(null);
    repository.getCheckinByDate.mockResolvedValue(failedRecord);
    repository.markCheckinPendingRetry.mockResolvedValue(pendingRecord);
    repository.markCheckinSuccess.mockResolvedValue(undefined);
    sub2api.addUserBalance.mockResolvedValue({
      newBalance: 108,
      requestId: 'req-keep-reward'
    });

    const result = await service.checkin({
      sub2apiUserId: failedRecord.sub2apiUserId,
      linuxdoSubject: failedRecord.linuxdoSubject,
      syntheticEmail: failedRecord.syntheticEmail,
      username: 'tester',
      avatarUrl: null
    });

    expect(repository.markCheckinPendingRetry).toHaveBeenCalledWith(failedRecord.id);
    expect(sub2api.addUserBalance).toHaveBeenCalledWith({
      userId: failedRecord.sub2apiUserId,
      amount: failedRecord.rewardBalance,
      notes: `福利签到 ${failedRecord.checkinDate}`,
      idempotencyKey: failedRecord.idempotencyKey
    });
    expect(result.reward_balance).toBe(failedRecord.rewardBalance);
  });

  it('普通签到会接管超时 pending 记录', async () => {
    const stalePending: CheckinRecord = {
      ...createFailedRecord(),
      grantStatus: 'pending',
      grantError: '',
      updatedAt: '2026-03-06T09:00:00.000Z'
    };
    const recoveredPending: CheckinRecord = {
      ...stalePending,
      updatedAt: '2026-03-06T10:00:00.000Z'
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T10:01:00.000Z'));

    repository.getSettings.mockResolvedValue({
      checkinEnabled: true,
      dailyRewardBalance: stalePending.rewardBalance,
      timezone: 'UTC'
    });
    repository.createCheckinPending.mockResolvedValue(null);
    repository.getCheckinByDate.mockResolvedValue(stalePending);
    repository.claimStalePending.mockResolvedValue(recoveredPending);
    repository.markCheckinSuccess.mockResolvedValue(undefined);
    sub2api.addUserBalance.mockResolvedValue({
      newBalance: 99,
      requestId: 'req-stale-pending'
    });

    const result = await service.checkin({
      sub2apiUserId: stalePending.sub2apiUserId,
      linuxdoSubject: stalePending.linuxdoSubject,
      syntheticEmail: stalePending.syntheticEmail,
      username: 'tester',
      avatarUrl: null
    });

    expect(repository.claimStalePending).toHaveBeenCalledWith(stalePending.id, 30000);
    expect(result.grant_status).toBe('success');

    vi.useRealTimers();
  });

  it('普通签到遇到未超时 pending 记录时继续阻止重试', async () => {
    const freshPending: CheckinRecord = {
      ...createFailedRecord(),
      grantStatus: 'pending',
      grantError: '',
      updatedAt: '2026-03-06T10:00:45.000Z'
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T10:01:00.000Z'));

    repository.getSettings.mockResolvedValue({
      checkinEnabled: true,
      dailyRewardBalance: freshPending.rewardBalance,
      timezone: 'UTC'
    });
    repository.createCheckinPending.mockResolvedValue(null);
    repository.getCheckinByDate.mockResolvedValue(freshPending);

    await expect(
      service.checkin({
        sub2apiUserId: freshPending.sub2apiUserId,
        linuxdoSubject: freshPending.linuxdoSubject,
        syntheticEmail: freshPending.syntheticEmail,
        username: 'tester',
        avatarUrl: null
      })
    ).rejects.toBeInstanceOf(ConflictError);

    expect(repository.claimStalePending).not.toHaveBeenCalled();
    expect(sub2api.addUserBalance).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

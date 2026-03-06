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
    createdAt: '2026-03-06T10:00:00.000Z'
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
      failedRecord.id,
      failedRecord.rewardBalance
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
});

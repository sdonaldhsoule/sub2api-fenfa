import { config } from '../config.js';
import { pool } from '../db.js';
import { WelfareRepository } from '../repositories/welfare-repository.js';
import type { CheckinRecord, SessionUser } from '../types/domain.js';
import { getBusinessDate, shiftDateString } from '../utils/date.js';
import { Sub2apiClient, sub2apiClient } from './sub2api-client.js';

export class ConflictError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

const PENDING_RECOVERY_AFTER_MS = Math.max(30_000, config.SUB2API_TIMEOUT_MS * 2);

function buildIdempotencyKey(sub2apiUserId: number, checkinDate: string): string {
  return `welfare-checkin:${sub2apiUserId}:${checkinDate}`;
}

const repository = new WelfareRepository(pool);

type WelfareRepositoryLike = Pick<
  WelfareRepository,
  | 'getSettings'
  | 'getCheckinByDate'
  | 'getCheckinById'
  | 'createCheckinPending'
  | 'markCheckinPendingRetry'
  | 'claimStalePending'
  | 'markCheckinSuccess'
  | 'markCheckinFailed'
  | 'listUserCheckins'
  | 'updateSettings'
  | 'getDailyStats'
  | 'getActiveUserCount'
  | 'queryAdminCheckins'
>;

type Sub2apiClientLike = Pick<Sub2apiClient, 'addUserBalance'>;

function buildGrantNotes(checkinDate: string): string {
  return `福利签到 ${checkinDate}`;
}

function isPendingRecoverable(record: CheckinRecord): boolean {
  if (record.grantStatus !== 'pending') {
    return false;
  }

  const updatedAtMs = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return true;
  }

  return Date.now() - updatedAtMs >= PENDING_RECOVERY_AFTER_MS;
}

function canAttemptCheckin(record: CheckinRecord | null): boolean {
  if (!record) {
    return true;
  }

  if (record.grantStatus === 'success') {
    return false;
  }

  if (record.grantStatus === 'failed') {
    return true;
  }

  return isPendingRecoverable(record);
}

export class CheckinService {
  constructor(
    private readonly repository: WelfareRepositoryLike,
    private readonly sub2api: Sub2apiClientLike
  ) {}

  async getStatus(user: SessionUser) {
    const settings = await this.repository.getSettings();
    const checkinDate = getBusinessDate(settings.timezone);
    const today = await this.repository.getCheckinByDate(user.sub2apiUserId, checkinDate);

    return {
      checkin_enabled: settings.checkinEnabled,
      timezone: settings.timezone,
      checkin_date: checkinDate,
      daily_reward_balance: settings.dailyRewardBalance,
      checked_in: today?.grantStatus === 'success',
      can_checkin: settings.checkinEnabled && canAttemptCheckin(today),
      grant_status: today?.grantStatus ?? null,
      checked_at: today?.createdAt ?? null,
      reward_balance: today?.rewardBalance ?? null
    };
  }

  async getHistory(user: SessionUser, limit = 30) {
    const records = await this.repository.listUserCheckins(user.sub2apiUserId, limit);
    return records.map((item) => ({
      id: item.id,
      checkin_date: item.checkinDate,
      reward_balance: item.rewardBalance,
      grant_status: item.grantStatus,
      grant_error: item.grantError,
      created_at: item.createdAt
    }));
  }

  async checkin(user: SessionUser) {
    const settings = await this.repository.getSettings();
    if (!settings.checkinEnabled) {
      throw new ForbiddenError('签到功能已关闭');
    }

    const checkinDate = getBusinessDate(settings.timezone);
    const idempotencyKey = buildIdempotencyKey(user.sub2apiUserId, checkinDate);
    const reward = settings.dailyRewardBalance;

    let pending = await this.repository.createCheckinPending({
      sub2apiUserId: user.sub2apiUserId,
      linuxdoSubject: user.linuxdoSubject,
      syntheticEmail: user.syntheticEmail,
      checkinDate,
      rewardBalance: reward,
      idempotencyKey
    });

    if (!pending) {
      const existing = await this.repository.getCheckinByDate(user.sub2apiUserId, checkinDate);
      if (!existing) {
        throw new Error('签到记录读取失败，请稍后重试');
      }
      pending = await this.claimRetryableCheckin(existing, '今日已签到，请明天再来');
    }

    const grantResult = await this.grantCheckin(pending);
    return {
      checkin_date: checkinDate,
      reward_balance: pending.rewardBalance,
      new_balance: grantResult.newBalance,
      grant_status: 'success'
    };
  }

  async retryFailedCheckin(id: number) {
    const existing = await this.repository.getCheckinById(id);
    if (!existing) {
      throw new NotFoundError('签到记录不存在');
    }

    const pending = await this.claimRetryableCheckin(
      existing,
      '该签到记录已发放成功'
    );

    const grantResult = await this.grantCheckin(pending);
    const updated = await this.repository.getCheckinById(pending.id);
    if (!updated) {
      throw new Error('签到记录读取失败，请稍后重试');
    }

    return {
      item: updated,
      new_balance: grantResult.newBalance
    };
  }

  private async grantCheckin(record: CheckinRecord) {
    let grantResult: Awaited<ReturnType<Sub2apiClientLike['addUserBalance']>>;

    try {
      grantResult = await this.sub2api.addUserBalance({
        userId: record.sub2apiUserId,
        amount: record.rewardBalance,
        notes: buildGrantNotes(record.checkinDate),
        idempotencyKey: record.idempotencyKey
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      try {
        await this.repository.markCheckinFailed(record.id, message.slice(0, 500));
      } catch (markFailedError) {
        console.error('[checkin] 回写失败状态异常', markFailedError);
      }
      throw error;
    }

    await this.repository.markCheckinSuccess(record.id, grantResult.requestId);
    return {
      newBalance: grantResult.newBalance ?? null,
      requestId: grantResult.requestId
    };
  }

  async getAdminSettings() {
    return this.repository.getSettings();
  }

  async updateAdminSettings(input: {
    checkinEnabled?: boolean;
    dailyRewardBalance?: number;
    timezone?: string;
  }) {
    return this.repository.updateSettings(input);
  }

  async getAdminDailyStats(days: number) {
    const settings = await this.repository.getSettings();
    const today = getBusinessDate(settings.timezone);
    const startDate = shiftDateString(today, -(days - 1));
    const [points, activeUsers] = await Promise.all([
      this.repository.getDailyStats(startDate),
      this.repository.getActiveUserCount(startDate)
    ]);
    const totalUsers = points.reduce((sum, point) => sum + point.checkinUsers, 0);
    const totalGrant = points.reduce((sum, point) => sum + point.grantTotal, 0);
    return {
      days,
      active_users: activeUsers,
      total_checkins: totalUsers,
      total_grant_balance: totalGrant,
      points
    };
  }

  async getAdminCheckins(params: {
    page: number;
    pageSize: number;
    dateFrom?: string;
    dateTo?: string;
    grantStatus?: string;
    subject?: string;
  }) {
    return this.repository.queryAdminCheckins(params);
  }

  private async claimRetryableCheckin(
    existing: CheckinRecord,
    successConflictMessage: string
  ): Promise<CheckinRecord> {
    if (existing.grantStatus === 'success') {
      throw new ConflictError(successConflictMessage);
    }

    if (existing.grantStatus === 'failed') {
      const pending = await this.repository.markCheckinPendingRetry(existing.id);
      if (!pending) {
        throw new ConflictError('签到处理中，请稍后刷新');
      }
      return pending;
    }

    if (!isPendingRecoverable(existing)) {
      throw new ConflictError('签到处理中，请稍后刷新');
    }

    const pending = await this.repository.claimStalePending(
      existing.id,
      PENDING_RECOVERY_AFTER_MS
    );
    if (!pending) {
      throw new ConflictError('签到处理中，请稍后刷新');
    }

    return pending;
  }
}

export const checkinService = new CheckinService(repository, sub2apiClient);
export const welfareRepository = repository;

import { pool } from '../db.js';
import { WelfareRepository } from '../repositories/welfare-repository.js';
import type { CheckinRecord, SessionUser } from '../types/domain.js';
import { getBusinessDate } from '../utils/date.js';
import { Sub2apiClient, sub2apiClient } from './sub2api-client.js';

export class ConflictError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

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
      if (existing.grantStatus === 'success') {
        throw new ConflictError('今日已签到，请明天再来');
      }
      if (existing.grantStatus === 'pending') {
        throw new ConflictError('签到处理中，请稍后刷新');
      }
      pending = await this.repository.markCheckinPendingRetry(existing.id, reward);
      if (!pending) {
        throw new ConflictError('签到处理中，请稍后刷新');
      }
    }

    const grantResult = await this.grantCheckin(pending);
    return {
      checkin_date: checkinDate,
      reward_balance: reward,
      new_balance: grantResult.newBalance,
      grant_status: 'success'
    };
  }

  async retryFailedCheckin(id: number) {
    const existing = await this.repository.getCheckinById(id);
    if (!existing) {
      throw new NotFoundError('签到记录不存在');
    }
    if (existing.grantStatus === 'success') {
      throw new ConflictError('该签到记录已发放成功');
    }
    if (existing.grantStatus === 'pending') {
      throw new ConflictError('该签到记录正在处理中');
    }

    const pending = await this.repository.markCheckinPendingRetry(
      existing.id,
      existing.rewardBalance
    );
    if (!pending) {
      throw new ConflictError('该签到记录状态已变化，请刷新后重试');
    }

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
    try {
      const grantResult = await this.sub2api.addUserBalance({
        userId: record.sub2apiUserId,
        amount: record.rewardBalance,
        notes: buildGrantNotes(record.checkinDate),
        idempotencyKey: record.idempotencyKey
      });
      await this.repository.markCheckinSuccess(record.id, grantResult.requestId);
      return {
        newBalance: grantResult.newBalance ?? null,
        requestId: grantResult.requestId
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      await this.repository.markCheckinFailed(record.id, message.slice(0, 500));
      throw error;
    }
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
    const [points, activeUsers] = await Promise.all([
      this.repository.getDailyStats(days),
      this.repository.getActiveUserCount(days)
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
}

export const checkinService = new CheckinService(repository, sub2apiClient);
export const welfareRepository = repository;

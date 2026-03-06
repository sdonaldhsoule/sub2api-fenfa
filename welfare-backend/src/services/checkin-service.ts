import { pool } from '../db.js';
import { WelfareRepository } from '../repositories/welfare-repository.js';
import type { SessionUser } from '../types/domain.js';
import { getBusinessDate } from '../utils/date.js';
import { sub2apiClient } from './sub2api-client.js';

export class ConflictError extends Error {}
export class ForbiddenError extends Error {}

function buildIdempotencyKey(sub2apiUserId: number, checkinDate: string): string {
  return `welfare-checkin:${sub2apiUserId}:${checkinDate}`;
}

const repository = new WelfareRepository(pool);

export class CheckinService {
  async getStatus(user: SessionUser) {
    const settings = await repository.getSettings();
    const checkinDate = getBusinessDate(settings.timezone);
    const today = await repository.getCheckinByDate(user.sub2apiUserId, checkinDate);

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
    const records = await repository.listUserCheckins(user.sub2apiUserId, limit);
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
    const settings = await repository.getSettings();
    if (!settings.checkinEnabled) {
      throw new ForbiddenError('签到功能已关闭');
    }

    const checkinDate = getBusinessDate(settings.timezone);
    const idempotencyKey = buildIdempotencyKey(user.sub2apiUserId, checkinDate);
    const reward = settings.dailyRewardBalance;

    let pending = await repository.createCheckinPending({
      sub2apiUserId: user.sub2apiUserId,
      linuxdoSubject: user.linuxdoSubject,
      syntheticEmail: user.syntheticEmail,
      checkinDate,
      rewardBalance: reward,
      idempotencyKey
    });

    if (!pending) {
      const existing = await repository.getCheckinByDate(user.sub2apiUserId, checkinDate);
      if (!existing) {
        throw new Error('签到记录读取失败，请稍后重试');
      }
      if (existing.grantStatus === 'success') {
        throw new ConflictError('今日已签到，请明天再来');
      }
      if (existing.grantStatus === 'pending') {
        throw new ConflictError('签到处理中，请稍后刷新');
      }
      pending = await repository.markCheckinPendingRetry(existing.id, reward);
      if (!pending) {
        throw new ConflictError('签到处理中，请稍后刷新');
      }
    }

    try {
      const grantResult = await sub2apiClient.addUserBalance({
        userId: user.sub2apiUserId,
        amount: reward,
        notes: `福利签到 ${checkinDate}`,
        idempotencyKey
      });
      await repository.markCheckinSuccess(pending.id, grantResult.requestId);
      return {
        checkin_date: checkinDate,
        reward_balance: reward,
        new_balance: grantResult.newBalance ?? null,
        grant_status: 'success'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      await repository.markCheckinFailed(pending.id, message.slice(0, 500));
      throw error;
    }
  }

  async getAdminSettings() {
    return repository.getSettings();
  }

  async updateAdminSettings(input: {
    checkinEnabled?: boolean;
    dailyRewardBalance?: number;
    timezone?: string;
  }) {
    return repository.updateSettings(input);
  }

  async getAdminDailyStats(days: number) {
    const [points, activeUsers] = await Promise.all([
      repository.getDailyStats(days),
      repository.getActiveUserCount(days)
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
    return repository.queryAdminCheckins(params);
  }
}

export const checkinService = new CheckinService();
export const welfareRepository = repository;

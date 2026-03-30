import { pool } from '../db.js';
import {
  WelfareRepository,
  type CreateResetRecordInput
} from '../repositories/welfare-repository.js';
import type { ResetRecord, SessionUser } from '../types/domain.js';
import { Sub2apiClient, sub2apiClient } from './sub2api-client.js';

export class ConflictError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

const RESET_LOCK_NAMESPACE = 8107;
const DEFAULT_STATUS_NOTICE = '当当前余额低于阈值时，可直接补到目标值。';

const repository = new WelfareRepository(pool);

type Sub2apiClientLike = Pick<Sub2apiClient, 'getAdminUserById' | 'addUserBalance'>;

function buildResetIdempotencyKey(userId: number): string {
  return `welfare-reset:${userId}:${Date.now()}`;
}

function toPositiveInteger(value: number): number {
  return Math.max(1, Math.min(2147483647, Math.trunc(Math.abs(value))));
}

function computeNextAvailableAt(createdAt: string, cooldownDays: number): string | null {
  if (cooldownDays <= 0) {
    return null;
  }

  const createdAtMs = Date.parse(createdAt);
  if (Number.isNaN(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs + cooldownDays * 24 * 60 * 60 * 1000).toISOString();
}

function isCooldownActive(record: ResetRecord | null, nowMs = Date.now()): boolean {
  if (!record || record.grantStatus !== 'success') {
    return false;
  }

  const nextAvailableAt = computeNextAvailableAt(record.createdAt, record.cooldownDays);
  if (!nextAvailableAt) {
    return false;
  }

  const nextAvailableAtMs = Date.parse(nextAvailableAt);
  if (Number.isNaN(nextAvailableAtMs)) {
    return false;
  }

  return nextAvailableAtMs > nowMs;
}

function mapResetRecordSummary(record: ResetRecord | null) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    before_balance: record.beforeBalance,
    threshold_balance: record.thresholdBalance,
    target_balance: record.targetBalance,
    granted_balance: record.grantedBalance,
    new_balance: record.newBalance,
    cooldown_days: record.cooldownDays,
    grant_status: record.grantStatus,
    grant_error: record.grantError,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

function resolveBalance(user: Awaited<ReturnType<Sub2apiClient['getAdminUserById']>>): number {
  if (!user) {
    throw new NotFoundError('sub2api 用户不存在');
  }

  if (typeof user.balance !== 'number' || !Number.isFinite(user.balance)) {
    throw new ConflictError('当前余额暂不可用，请稍后再试');
  }

  return user.balance;
}

export class ResetService {
  constructor(
    private readonly resetRepository: WelfareRepository,
    private readonly sub2api: Sub2apiClientLike
  ) {}

  async getStatus(user: SessionUser) {
    const [settings, latestRecord, latestSuccess, upstreamUser] = await Promise.all([
      this.resetRepository.getSettings(),
      this.resetRepository.getLatestUserResetRecord(user.sub2apiUserId),
      this.resetRepository.getLatestUserSuccessfulReset(user.sub2apiUserId),
      this.sub2api.getAdminUserById(user.sub2apiUserId)
    ]);

    const currentBalance = resolveBalance(upstreamUser);
    const nextAvailableAt = computeNextAvailableAt(
      latestSuccess?.createdAt ?? '',
      latestSuccess?.cooldownDays ?? settings.resetCooldownDays
    );

    let canApply = true;
    let reason = '';

    if (!settings.resetEnabled) {
      canApply = false;
      reason = '额度重置暂未开放';
    } else if (settings.resetTargetBalance <= settings.resetThresholdBalance) {
      canApply = false;
      reason = '重置规则配置异常，请联系管理员';
    } else if (currentBalance >= settings.resetTargetBalance) {
      canApply = false;
      reason = '当前余额已达到目标值，无需重置';
    } else if (currentBalance >= settings.resetThresholdBalance) {
      canApply = false;
      reason = `当前余额未低于阈值 ${settings.resetThresholdBalance}`;
    } else if (isCooldownActive(latestSuccess)) {
      canApply = false;
      reason = '重置冷却中，请稍后再试';
    }

    return {
      reset_enabled: settings.resetEnabled,
      current_balance: currentBalance,
      threshold_balance: settings.resetThresholdBalance,
      target_balance: settings.resetTargetBalance,
      cooldown_days: settings.resetCooldownDays,
      notice: settings.resetNotice || DEFAULT_STATUS_NOTICE,
      can_apply: canApply,
      reason,
      next_available_at: canApply ? null : nextAvailableAt,
      latest_record: mapResetRecordSummary(latestRecord)
    };
  }

  async getHistory(user: SessionUser, limit = 20) {
    const records = await this.resetRepository.listUserResetRecords(
      user.sub2apiUserId,
      limit
    );
    return records.map((record) => ({
      id: record.id,
      before_balance: record.beforeBalance,
      threshold_balance: record.thresholdBalance,
      target_balance: record.targetBalance,
      granted_balance: record.grantedBalance,
      new_balance: record.newBalance,
      cooldown_days: record.cooldownDays,
      grant_status: record.grantStatus,
      grant_error: record.grantError,
      created_at: record.createdAt,
      updated_at: record.updatedAt
    }));
  }

  async apply(user: SessionUser) {
    const client = await pool.connect();
    const lockKey = toPositiveInteger(user.sub2apiUserId);

    try {
      await client.query('SELECT pg_advisory_lock($1, $2)', [RESET_LOCK_NAMESPACE, lockKey]);

      const settings = await this.resetRepository.getSettings(client);
      if (!settings.resetEnabled) {
        throw new ForbiddenError('额度重置暂未开放');
      }

      if (settings.resetTargetBalance <= settings.resetThresholdBalance) {
        throw new ConflictError('重置规则配置异常，请联系管理员');
      }

      const latestSuccess = await this.resetRepository.getLatestUserSuccessfulReset(
        user.sub2apiUserId,
        client
      );
      if (isCooldownActive(latestSuccess)) {
        throw new ConflictError('重置冷却中，请稍后再试');
      }

      const upstreamUser = await this.sub2api.getAdminUserById(user.sub2apiUserId);
      const currentBalance = resolveBalance(upstreamUser);

      if (currentBalance >= settings.resetTargetBalance) {
        throw new ConflictError('当前余额已达到目标值，无需重置');
      }

      if (currentBalance >= settings.resetThresholdBalance) {
        throw new ConflictError(
          `当前余额未低于阈值 ${settings.resetThresholdBalance}`
        );
      }

      const grantedBalance = settings.resetTargetBalance - currentBalance;
      const pendingInput: CreateResetRecordInput = {
        sub2apiUserId: user.sub2apiUserId,
        sub2apiEmail: upstreamUser?.email || user.email,
        sub2apiUsername:
          upstreamUser?.username || user.username || upstreamUser?.email || user.email,
        linuxdoSubject: user.linuxdoSubject,
        beforeBalance: currentBalance,
        thresholdBalance: settings.resetThresholdBalance,
        targetBalance: settings.resetTargetBalance,
        grantedBalance,
        cooldownDays: settings.resetCooldownDays,
        idempotencyKey: buildResetIdempotencyKey(user.sub2apiUserId)
      };

      const pendingRecord = await this.resetRepository.createResetPending(
        pendingInput,
        client
      );

      try {
        const grantResult = await this.sub2api.addUserBalance({
          userId: user.sub2apiUserId,
          amount: grantedBalance,
          notes: `福利额度重置 ${currentBalance} -> ${settings.resetTargetBalance}`,
          idempotencyKey: pendingRecord.idempotencyKey
        });

        const newBalance = grantResult.newBalance ?? settings.resetTargetBalance;
        await this.resetRepository.markResetSuccess(
          pendingRecord.id,
          grantResult.requestId,
          newBalance,
          client
        );

        return {
          id: pendingRecord.id,
          before_balance: currentBalance,
          granted_balance: grantedBalance,
          new_balance: newBalance,
          target_balance: settings.resetTargetBalance,
          next_available_at: computeNextAvailableAt(
            pendingRecord.createdAt,
            settings.resetCooldownDays
          ),
          grant_status: 'success' as const
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown error';
        await this.resetRepository.markResetFailed(
          pendingRecord.id,
          detail.slice(0, 500),
          client
        );
        throw error;
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        RESET_LOCK_NAMESPACE,
        lockKey
      ]);
      client.release();
    }
  }

  async getAdminResetRecords(params: {
    page: number;
    pageSize: number;
    dateFrom?: string;
    dateTo?: string;
    grantStatus?: string;
    subject?: string;
  }) {
    return this.resetRepository.queryAdminResetRecords(params);
  }
}

export const resetService = new ResetService(repository, sub2apiClient);

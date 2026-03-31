import { pool } from '../db.js';
import { RiskRepository, type SaveRiskEventInput } from '../repositories/risk-repository.js';
import { WelfareRepository } from '../repositories/welfare-repository.js';
import type { RiskEvent, RiskEventStatus, RiskScanState, SessionUser } from '../types/domain.js';
import { extractLinuxDoSubjectFromEmail } from '../utils/oauth.js';
import { sessionStateService, SessionStateService } from './session-state-service.js';
import {
  sub2apiClient,
  Sub2apiClient,
  type AdminUsageLogRecord,
  type AdminUserRecord
} from './sub2api-client.js';

export const DISTRIBUTION_WINDOW_MS = 60 * 60 * 1000;
export const DISTRIBUTION_IP_THRESHOLD = 4;
export const DISTRIBUTION_MINIMUM_LOCK_MS = 24 * 60 * 60 * 1000;
export const DISTRIBUTION_SCAN_INTERVAL_MS = 5 * 60 * 1000;

const DISTRIBUTION_USAGE_PAGE_SIZE = 200;
const MAX_IP_SAMPLE_COUNT = 10;

type ScanSource = 'scheduled' | 'manual' | 'auth';

interface LoggerLike {
  info(message: string): void;
  error(message: string, error?: unknown): void;
  warn?(message: string, error?: unknown): void;
}

interface RiskIdentity {
  sub2apiUserId: number;
  email: string;
  username: string;
  linuxdoSubject: string | null;
}

interface AdminExemptions {
  userIds: Set<number>;
  subjects: Set<string>;
}

interface DistributionSignal {
  userId: number;
  user: AdminUserRecord;
  ipSamples: string[];
  distinctIpCount: number;
  firstHitAt: string;
  lastHitAt: string;
}

interface SignalAggregate {
  user: AdminUserRecord | null;
  ipSet: Set<string>;
  firstHitAt: string | null;
  lastHitAt: string | null;
}

export interface RiskOverview {
  activeEventCount: number;
  pendingReleaseCount: number;
  openEventCount: number;
  lastScan: RiskScanState;
}

export function buildMinimumLockUntil(referenceMs: number): string {
  return new Date(referenceMs + DISTRIBUTION_MINIMUM_LOCK_MS).toISOString();
}

export function summarizeUsageLogs(
  logs: Array<{
    userId: number;
    ipAddress: string | null;
    createdAt: string;
  }>,
  nowMs = Date.now()
): Array<{
  sub2apiUserId: number;
  distinctIpCount: number;
  ipSamples: string[];
  firstHitAt: string;
  lastHitAt: string;
}> {
  const cutoffMs = nowMs - DISTRIBUTION_WINDOW_MS;
  const grouped = new Map<
    number,
    {
      ipSet: Set<string>;
      firstHitAt: string | null;
      lastHitAt: string | null;
    }
  >();

  for (const log of logs) {
    const createdAtMs = Date.parse(log.createdAt);
    const ip = normalizeIp(log.ipAddress);
    if (
      !Number.isInteger(log.userId) ||
      log.userId <= 0 ||
      Number.isNaN(createdAtMs) ||
      createdAtMs < cutoffMs ||
      !ip
    ) {
      continue;
    }

    const current =
      grouped.get(log.userId) ?? {
        ipSet: new Set<string>(),
        firstHitAt: null,
        lastHitAt: null
      };
    current.ipSet.add(ip);
    if (!current.firstHitAt || createdAtMs < Date.parse(current.firstHitAt)) {
      current.firstHitAt = log.createdAt;
    }
    if (!current.lastHitAt || createdAtMs > Date.parse(current.lastHitAt)) {
      current.lastHitAt = log.createdAt;
    }
    grouped.set(log.userId, current);
  }

  return Array.from(grouped.entries()).map(([sub2apiUserId, value]) => ({
    sub2apiUserId,
    distinctIpCount: value.ipSet.size,
    ipSamples: Array.from(value.ipSet).sort(),
    firstHitAt: value.firstHitAt ?? new Date(nowMs).toISOString(),
    lastHitAt: value.lastHitAt ?? new Date(nowMs).toISOString()
  }));
}

function trimErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message.slice(0, 500);
  }

  return 'unknown error';
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '' ? null : normalized;
}

function normalizeUserRole(value: string | undefined): 'admin' | 'user' {
  return value === 'admin' ? 'admin' : 'user';
}

function normalizeUserStatus(value: string | undefined): string {
  const normalized = (value ?? '').trim();
  return normalized === '' ? 'active' : normalized;
}

export class RiskAccessDeniedError extends Error {
  constructor(readonly event: RiskEvent, detail: string) {
    super(detail);
    this.name = 'RiskAccessDeniedError';
  }
}

export class RiskNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiskNotFoundError';
  }
}

export class RiskConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiskConflictError';
  }
}

type WelfareRepositoryLike = Pick<
  WelfareRepository,
  'hasAdminUserId' | 'hasLegacyAdminSubject' | 'listAdminWhitelist'
>;

type Sub2apiClientLike = Pick<
  Sub2apiClient,
  'getAdminUserById' | 'listAdminUsageLogs' | 'updateAdminUserStatus'
>;

export class DistributionDetectionService {
  private runningScan: Promise<{
    scannedLogCount: number;
    matchedUserCount: number;
    createdEventCount: number;
    refreshedEventCount: number;
    skippedAdminCount: number;
    retriedMainSiteCount: number;
    lastScan: RiskScanState;
    startedAt: string;
    finishedAt: string;
  }> | null = null;

  constructor(
    private readonly repository: RiskRepository,
    private readonly sessionState: Pick<
      SessionStateService,
      'bumpSessionVersion' | 'getSessionVersion'
    >,
    private readonly sub2api: Sub2apiClientLike,
    private readonly welfare: WelfareRepositoryLike,
    private readonly logger: LoggerLike
  ) {}

  startScanLoop(intervalMs = DISTRIBUTION_SCAN_INTERVAL_MS): NodeJS.Timeout {
    const run = async () => {
      try {
        await this.runBatchScan('scheduled');
      } catch (error) {
        this.logger.error('[risk] 定时分发扫描失败', error);
      }
    };

    void run();
    const timer = setInterval(() => {
      void run();
    }, intervalMs);
    timer.unref?.();
    return timer;
  }

  getBlockedDetail(event: RiskEvent): string {
    if (event.status === 'pending_release') {
      return '账号因疑似分发已被封禁，当前处于待人工恢复状态';
    }

    return '账号因疑似分发已被封禁，至少锁定 24 小时';
  }

  async evaluateAccess(
    identity: RiskIdentity,
    source: string
  ): Promise<{ blockedEvent: RiskEvent | null; sessionInvalidated: boolean }> {
    if (await this.isWelfareAdmin(identity.sub2apiUserId, identity.linuxdoSubject)) {
      return {
        blockedEvent: null,
        sessionInvalidated: false
      };
    }

    await this.repository.syncExpiredEvents(nowIso(), undefined, identity.sub2apiUserId);

    const existing = await this.repository.getBlockingEventByUserId(identity.sub2apiUserId);
    if (existing) {
      return {
        blockedEvent: existing,
        sessionInvalidated: false
      };
    }

    const sessionVersionBefore = await this.sessionState.getSessionVersion(
      identity.sub2apiUserId
    );
    const [user, whitelist] = await Promise.all([
      this.sub2api.getAdminUserById(identity.sub2apiUserId),
      this.welfare.listAdminWhitelist()
    ]);

    if (!user || this.isExemptUser(user, whitelist)) {
      return {
        blockedEvent: null,
        sessionInvalidated: false
      };
    }

    const event = await this.scanSingleUser(
      identity.sub2apiUserId,
      user,
      whitelist,
      source
    );
    if (!event) {
      return {
        blockedEvent: null,
        sessionInvalidated: false
      };
    }

    const sessionVersionAfter = await this.sessionState.getSessionVersion(
      identity.sub2apiUserId
    );
    return {
      blockedEvent: event,
      sessionInvalidated: sessionVersionAfter !== sessionVersionBefore
    };
  }

  async assertAccessAllowed(
    identity: number | RiskIdentity,
    options: {
      source: string;
      recheck: boolean;
    }
  ): Promise<void> {
    const normalizedIdentity: RiskIdentity =
      typeof identity === 'number'
        ? {
            sub2apiUserId: identity,
            email: '',
            username: '',
            linuxdoSubject: null
          }
        : identity;

    if (
      await this.isWelfareAdmin(
        normalizedIdentity.sub2apiUserId,
        normalizedIdentity.linuxdoSubject
      )
    ) {
      return;
    }

    await this.repository.syncExpiredEvents(nowIso(), undefined, normalizedIdentity.sub2apiUserId);

    const existing = await this.repository.getBlockingEventByUserId(
      normalizedIdentity.sub2apiUserId
    );
    if (existing) {
      throw new RiskAccessDeniedError(existing, this.getBlockedDetail(existing));
    }

    if (!options.recheck) {
      return;
    }

    const [user, whitelist] = await Promise.all([
      this.sub2api.getAdminUserById(normalizedIdentity.sub2apiUserId),
      this.welfare.listAdminWhitelist()
    ]);

    if (!user) {
      return;
    }

    if (this.isExemptUser(user, whitelist)) {
      return;
    }

    const event = await this.scanSingleUser(
      normalizedIdentity.sub2apiUserId,
      user,
      whitelist,
      options.source
    );
    if (event) {
      throw new RiskAccessDeniedError(event, this.getBlockedDetail(event));
    }
  }

  async getOverview(): Promise<RiskOverview> {
    await this.repository.syncExpiredEvents(nowIso());
    const [counts, lastScan] = await Promise.all([
      this.repository.getRiskEventCounts(),
      this.repository.getRiskScanState()
    ]);

    return {
      activeEventCount: counts.active,
      pendingReleaseCount: counts.pending_release,
      openEventCount: counts.active + counts.pending_release,
      lastScan
    };
  }

  async listEvents(params: {
    page: number;
    pageSize: number;
    status?: RiskEventStatus;
  }): Promise<{ items: RiskEvent[]; total: number }> {
    await this.repository.syncExpiredEvents(nowIso());
    return this.repository.listRiskEvents(params);
  }

  async runBatchScan(source: Exclude<ScanSource, 'auth'>) {
    if (this.runningScan) {
      return this.runningScan;
    }

    const execution = this.runBatchScanInternal(source).finally(() => {
      if (this.runningScan === execution) {
        this.runningScan = null;
      }
    });
    this.runningScan = execution;
    return execution;
  }

  async releaseEvent(
    eventId: number,
    operator: {
      sub2apiUserId: number;
      email: string;
      username: string;
    },
    releaseReason: string
  ): Promise<RiskEvent> {
    const releaseAt = nowIso();
    await this.repository.syncExpiredEvents(releaseAt);

    const existing = await this.repository.getRiskEventById(eventId);
    if (!existing) {
      throw new RiskNotFoundError('风险事件不存在');
    }

    if (existing.status === 'released') {
      throw new RiskConflictError('该风险事件已恢复');
    }

    if (existing.status !== 'pending_release') {
      throw new RiskConflictError('当前事件还未进入待人工恢复状态');
    }

    const updatedUser = await this.sub2api.updateAdminUserStatus(
      existing.sub2apiUserId,
      'active'
    );

    return this.repository.releaseRiskEvent(existing.id, {
      releasedAt: releaseAt,
      releasedBySub2apiUserId: operator.sub2apiUserId,
      releasedByEmail: operator.email,
      releasedByUsername: operator.username,
      releaseReason: releaseReason.trim(),
      sub2apiStatus: normalizeUserStatus(updatedUser.status),
      mainSiteSyncStatus: 'success',
      mainSiteSyncError: ''
    });
  }

  private async runBatchScanInternal(source: Exclude<ScanSource, 'auth'>) {
    const startedAt = nowIso();
    await this.repository.syncExpiredEvents(startedAt);
    await this.repository.markRiskScanStarted(source, startedAt);

    try {
      const [usageLogs, whitelist] = await Promise.all([
        this.listUsageLogsForWindow({ userId: undefined }),
        this.welfare.listAdminWhitelist()
      ]);
      const signals = await this.extractSignalsFromUsageLogs(usageLogs, whitelist);

      let createdEventCount = 0;
      let refreshedEventCount = 0;
      let retriedMainSiteCount = 0;

      for (const signal of signals) {
        const result = await this.lockUserForDistribution(signal, source);
        if (result.created) {
          createdEventCount += 1;
        } else {
          refreshedEventCount += 1;
        }
        if (result.retriedMainSite) {
          retriedMainSiteCount += 1;
        }
      }

      const finishedAt = nowIso();
      await this.repository.markRiskScanFinished({
        status: 'success',
        source,
        finishedAt,
        error: '',
        scannedUserCount: usageLogs.length,
        hitUserCount: signals.length
      });
      const lastScan = await this.repository.getRiskScanState();

      return {
        scannedLogCount: usageLogs.length,
        matchedUserCount: signals.length,
        createdEventCount,
        refreshedEventCount,
        skippedAdminCount: 0,
        retriedMainSiteCount,
        lastScan,
        startedAt,
        finishedAt
      };
    } catch (error) {
      const finishedAt = nowIso();
      await this.repository.markRiskScanFinished({
        status: 'failed',
        source,
        finishedAt,
        error: trimErrorMessage(error),
        scannedUserCount: 0,
        hitUserCount: 0
      });
      throw error;
    }
  }

  private async scanSingleUser(
    sub2apiUserId: number,
    user: AdminUserRecord,
    whitelist: Awaited<ReturnType<WelfareRepositoryLike['listAdminWhitelist']>>,
    source: string
  ): Promise<RiskEvent | null> {
    const usageLogs = await this.listUsageLogsForWindow({ userId: sub2apiUserId });
    const signals = await this.extractSignalsFromUsageLogs(usageLogs, whitelist, user);
    const signal = signals.find((item) => item.userId === sub2apiUserId);
    if (!signal) {
      return null;
    }

    const result = await this.lockUserForDistribution(signal, source);
    return result.event;
  }

  private async listUsageLogsForWindow(params: {
    userId?: number;
  }): Promise<AdminUsageLogRecord[]> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - DISTRIBUTION_WINDOW_MS);
    const startDate = toDateOnly(windowStart);
    const endDate = toDateOnly(now);

    const items: AdminUsageLogRecord[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const result = await this.sub2api.listAdminUsageLogs({
        page,
        pageSize: DISTRIBUTION_USAGE_PAGE_SIZE,
        startDate,
        endDate,
        timezone: 'UTC',
        exactTotal: true,
        userId: params.userId
      });
      items.push(...result.items);
      totalPages = Math.max(1, result.pages);
      if (result.items.length === 0) {
        break;
      }
      page += 1;
    }

    return items.filter((item) => {
      const createdAtMs = Date.parse(item.createdAt);
      if (Number.isNaN(createdAtMs)) {
        return false;
      }
      return createdAtMs >= windowStart.getTime() && createdAtMs <= now.getTime();
    });
  }

  private async extractSignalsFromUsageLogs(
    usageLogs: AdminUsageLogRecord[],
    whitelist: Awaited<ReturnType<WelfareRepositoryLike['listAdminWhitelist']>>,
    fallbackUser?: AdminUserRecord
  ): Promise<DistributionSignal[]> {
    const grouped = new Map<number, SignalAggregate>();

    for (const item of usageLogs) {
      const target =
        grouped.get(item.userId) ??
        {
          user: null,
          ipSet: new Set<string>(),
          firstHitAt: null,
          lastHitAt: null
        };

      target.user =
        target.user ??
        item.user ??
        (fallbackUser?.id === item.userId ? fallbackUser : null);

      const ip = normalizeIp(item.ipAddress);
      if (ip) {
        target.ipSet.add(ip);

        if (!target.firstHitAt || Date.parse(item.createdAt) < Date.parse(target.firstHitAt)) {
          target.firstHitAt = item.createdAt;
        }
        if (!target.lastHitAt || Date.parse(item.createdAt) > Date.parse(target.lastHitAt)) {
          target.lastHitAt = item.createdAt;
        }
      }

      grouped.set(item.userId, target);
    }

    const signals: DistributionSignal[] = [];
    for (const [userId, value] of grouped) {
      const user = value.user ?? (fallbackUser?.id === userId ? fallbackUser : null);
      if (!user) {
        continue;
      }
      if (this.isExemptUser(user, whitelist)) {
        continue;
      }
      if (value.ipSet.size < DISTRIBUTION_IP_THRESHOLD) {
        continue;
      }

      signals.push({
        userId,
        user,
        ipSamples: Array.from(value.ipSet).sort().slice(0, MAX_IP_SAMPLE_COUNT),
        distinctIpCount: value.ipSet.size,
        firstHitAt: value.firstHitAt ?? nowIso(),
        lastHitAt: value.lastHitAt ?? nowIso()
      });
    }

    return signals;
  }

  private isExemptUser(
    user: AdminUserRecord,
    whitelist: Awaited<ReturnType<WelfareRepositoryLike['listAdminWhitelist']>>
  ): boolean {
    if (normalizeUserRole(user.role) === 'admin') {
      return true;
    }

    const whitelistUserIds = new Set(
      whitelist
        .map((item) => item.sub2apiUserId)
        .filter((item): item is number => typeof item === 'number' && item > 0)
    );
    if (whitelistUserIds.has(user.id)) {
      return true;
    }

    const whitelistSubjects = new Set(
      whitelist
        .map((item) => item.linuxdoSubject?.trim())
        .filter((item): item is string => Boolean(item))
    );
    const subject = extractLinuxDoSubjectFromEmail(user.email);
    return Boolean(subject && whitelistSubjects.has(subject));
  }

  private async lockUserForDistribution(
    signal: DistributionSignal,
    source: string
  ): Promise<{
    event: RiskEvent;
    created: boolean;
    retriedMainSite: boolean;
  }> {
    const scanAt = nowIso();
    const minimumLockUntil = new Date(Date.now() + DISTRIBUTION_MINIMUM_LOCK_MS).toISOString();

    const transactionResult = await this.repository.withTransaction(async (client) => {
      await this.repository.syncExpiredEvents(scanAt, client);
      const existing = await this.repository.getBlockingEventByUserId(signal.user.id, {
        client,
        forUpdate: true
      });

      const mainSiteSyncStatus: 'success' | 'pending' =
        normalizeUserStatus(signal.user.status) === 'disabled'
          ? 'success'
          : 'pending';

      const saveInput: SaveRiskEventInput = {
        sub2apiUserId: signal.user.id,
        sub2apiEmail: signal.user.email,
        sub2apiUsername: signal.user.username || signal.user.email,
        linuxdoSubject: extractLinuxDoSubjectFromEmail(signal.user.email),
        sub2apiRole: normalizeUserRole(signal.user.role),
        sub2apiStatus: normalizeUserStatus(signal.user.status),
        status: 'active' as const,
        windowStartedAt: new Date(Date.now() - DISTRIBUTION_WINDOW_MS).toISOString(),
        windowEndedAt: scanAt,
        distinctIpCount: signal.distinctIpCount,
        ipSamples: signal.ipSamples,
        firstHitAt: signal.firstHitAt,
        lastHitAt: signal.lastHitAt,
        minimumLockUntil,
        mainSiteSyncStatus,
        mainSiteSyncError: '',
        lastScanStatus: 'success' as const,
        lastScanError: '',
        lastScanSource: source,
        lastScannedAt: scanAt
      };

      if (!existing) {
        const created = await this.repository.createBlockingEvent(saveInput, client);
        await this.sessionState.bumpSessionVersion(signal.user.id, client);
        return {
          event: created,
          created: true
        };
      }

      const refreshed = await this.repository.updateBlockingEventFromHit(
        existing.id,
        {
          ...saveInput,
          firstHitAt: existing.firstHitAt
        },
        client
      );
      return {
        event: refreshed,
        created: false
      };
    });

    if (normalizeUserStatus(signal.user.status) === 'disabled') {
      const event = await this.repository.updateRiskEventSync(transactionResult.event.id, {
        sub2apiStatus: 'disabled',
        mainSiteSyncStatus: 'success',
        mainSiteSyncError: ''
      });
      return {
        event,
        created: transactionResult.created,
        retriedMainSite: false
      };
    }

    try {
      const updatedUser = await this.sub2api.updateAdminUserStatus(signal.user.id, 'disabled');
      const event = await this.repository.updateRiskEventSync(transactionResult.event.id, {
        sub2apiStatus: normalizeUserStatus(updatedUser.status),
        mainSiteSyncStatus: 'success',
        mainSiteSyncError: ''
      });
      return {
        event,
        created: transactionResult.created,
        retriedMainSite: true
      };
    } catch (error) {
      const event = await this.repository.updateRiskEventSync(transactionResult.event.id, {
        sub2apiStatus: transactionResult.event.sub2apiStatus,
        mainSiteSyncStatus: 'failed',
        mainSiteSyncError: trimErrorMessage(error)
      });
      this.logger.warn?.(
        `[risk] 主站封禁同步失败: user=${signal.user.id}`,
        error
      );
      return {
        event,
        created: transactionResult.created,
        retriedMainSite: true
      };
    }
  }

  private async isWelfareAdmin(
    sub2apiUserId: number,
    linuxdoSubject: string | null
  ): Promise<boolean> {
    const [byUserId, bySubject] = await Promise.all([
      this.welfare.hasAdminUserId(sub2apiUserId),
      linuxdoSubject
        ? this.welfare.hasLegacyAdminSubject(linuxdoSubject)
        : Promise.resolve(false)
    ]);

    return byUserId || bySubject;
  }
}

const repository = new RiskRepository(pool);

export const distributionDetectionService = new DistributionDetectionService(
  repository,
  sessionStateService,
  sub2apiClient,
  new WelfareRepository(pool),
  console
);

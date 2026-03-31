import type { RiskEvent, RiskEventStatus, SessionUser } from '../types/domain.js';
import {
  distributionDetectionService,
  DistributionDetectionService,
  type RiskOverview,
  RiskConflictError as RiskReleaseConflictError,
  RiskNotFoundError as RiskEventNotFoundError,
  DISTRIBUTION_IP_THRESHOLD,
  DISTRIBUTION_MINIMUM_LOCK_MS as DISTRIBUTION_MIN_LOCK_MS,
  DISTRIBUTION_SCAN_INTERVAL_MS,
  DISTRIBUTION_WINDOW_MS
} from './distribution-detection-service.js';

interface AccessGuardOptions {
  source: string;
  recheck: boolean;
}

type RiskIdentity = Pick<
  SessionUser,
  'sub2apiUserId' | 'email' | 'username' | 'linuxdoSubject'
>;

export class RiskBlockedError extends Error {
  constructor(readonly event: RiskEvent) {
    super(distributionDetectionService.getBlockedDetail(event));
    this.name = 'RiskBlockedError';
  }
}

export class DistributionRiskService {
  constructor(private readonly inner: DistributionDetectionService) {}

  startScanLoop(intervalMs = DISTRIBUTION_SCAN_INTERVAL_MS): NodeJS.Timeout {
    return this.inner.startScanLoop(intervalMs);
  }

  async runFullScan(source: 'scheduled' | 'manual'): Promise<{
    source: string;
    scannedUsers: number;
    hitUsers: number;
  }> {
    const result = await this.inner.runBatchScan(source);
    return {
      source,
      scannedUsers: result.matchedUserCount,
      hitUsers: result.createdEventCount + result.refreshedEventCount
    };
  }

  async assertAccessAllowed(
    identity: number | RiskIdentity,
    options: AccessGuardOptions
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

    const decision = await this.inner.evaluateAccess(
      normalizedIdentity,
      options.source
    );
    if (decision.blockedEvent) {
      throw new RiskBlockedError(decision.blockedEvent);
    }
  }

  async getAdminOverview(): Promise<{
    counts: {
      active: number;
      pendingRelease: number;
      released: number;
    };
    lastScan: RiskOverview['lastScan'];
  }> {
    const overview = await this.inner.getOverview();
    return {
      counts: {
        active: overview.activeEventCount,
        pendingRelease: overview.pendingReleaseCount,
        released: 0
      },
      lastScan: overview.lastScan
    };
  }

  async listAdminEvents(params: {
    page: number;
    pageSize: number;
    status?: RiskEventStatus;
  }) {
    return this.inner.listEvents(params);
  }

  async releaseEvent(
    eventId: number,
    operator: {
      sub2apiUserId: number;
      email: string;
      username: string;
    },
    releaseReason: string
  ) {
    return this.inner.releaseEvent(eventId, operator, releaseReason);
  }
}

export const distributionRiskService = new DistributionRiskService(
  distributionDetectionService
);

export {
  DISTRIBUTION_IP_THRESHOLD,
  DISTRIBUTION_MIN_LOCK_MS,
  DISTRIBUTION_SCAN_INTERVAL_MS,
  DISTRIBUTION_WINDOW_MS,
  RiskEventNotFoundError,
  RiskReleaseConflictError
};

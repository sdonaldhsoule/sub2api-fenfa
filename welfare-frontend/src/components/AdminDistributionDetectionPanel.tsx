import { useEffect, useState } from 'react';
import { api, isUnauthorizedError } from '../lib/api';
import { formatAdminDateTime } from '../lib/admin-format';
import type {
  AdminRiskEvent,
  AdminRiskEventList,
  AdminRiskEventQuery,
  AdminRiskOverview
} from '../types';

interface AdminDistributionDetectionPanelProps {
  overview: AdminRiskOverview | null;
  onOverviewChange: (next: AdminRiskOverview) => void;
  onUnauthorized: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const defaultFilters: AdminRiskEventQuery = {
  page: 1,
  page_size: 10
};

function renderRiskStatus(status: AdminRiskEvent['status']) {
  if (status === 'released') {
    return <span className="status-tag success">已恢复</span>;
  }

  if (status === 'pending_release') {
    return <span className="status-tag pending">待人工恢复</span>;
  }

  return <span className="status-tag failed">封禁中</span>;
}

function renderSyncStatus(status: AdminRiskEvent['mainSiteSyncStatus']) {
  if (status === 'success') {
    return <span className="status-tag success">主站已禁用</span>;
  }

  if (status === 'failed') {
    return <span className="status-tag failed">主站同步失败</span>;
  }

  return <span className="status-tag pending">主站待同步</span>;
}

export function AdminDistributionDetectionPanel({
  overview,
  onOverviewChange,
  onUnauthorized,
  onError,
  onSuccess
}: AdminDistributionDetectionPanelProps) {
  const [filters, setFilters] = useState<AdminRiskEventQuery>(defaultFilters);
  const [list, setList] = useState<AdminRiskEventList | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [releaseReason, setReleaseReason] = useState('');

  useEffect(() => {
    void refreshOverview();
  }, []);

  useEffect(() => {
    void loadEvents(filters);
  }, [filters]);

  async function refreshOverview() {
    try {
      const nextOverview = await api.getAdminRiskOverview();
      onOverviewChange(nextOverview);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }

      onError(err instanceof Error ? err.message : '风险总览加载失败');
    }
  }

  async function loadEvents(nextFilters: AdminRiskEventQuery) {
    setLoading(true);
    try {
      const result = await api.listAdminRiskEvents(nextFilters);
      setList(result);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }

      onError(err instanceof Error ? err.message : '风险事件加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualScan() {
    setScanning(true);
    try {
      const result = await api.scanAdminRiskEvents();
      await Promise.all([
        refreshOverview(),
        loadEvents(filters)
      ]);
      onSuccess(
        `手动扫描完成：命中 ${result.matched_user_count} 人，新建 ${result.created_event_count} 条，刷新 ${result.refreshed_event_count} 条`
      );
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }

      onError(err instanceof Error ? err.message : '手动扫描失败');
    } finally {
      setScanning(false);
    }
  }

  async function handleRelease(item: AdminRiskEvent) {
    const confirmed = window.confirm(
      `确认恢复用户 #${item.sub2apiUserId} 吗？该操作会把主站账号恢复为 active。`
    );
    if (!confirmed) {
      return;
    }

    setReleasingId(item.id);
    try {
      await api.releaseAdminRiskEvent(item.id, {
        reason: releaseReason.trim() || undefined
      });
      await Promise.all([
        refreshOverview(),
        loadEvents(filters)
      ]);
      onSuccess(`已恢复用户 #${item.sub2apiUserId}`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }

      onError(err instanceof Error ? err.message : '手动恢复失败');
    } finally {
      setReleasingId(null);
    }
  }

  return (
    <div className="admin-section-stack">
      <section className="panel">
        <div className="section-head">
          <h3 className="section-title">分发检测总览</h3>
        </div>

        <div className="admin-stats-summary">
          <span className="chip">封禁中：{overview?.active_event_count ?? 0}</span>
          <span className="chip">待人工恢复：{overview?.pending_release_count ?? 0}</span>
          <span className="chip">未结事件：{overview?.open_event_count ?? 0}</span>
        </div>

        <div className="admin-risk-overview-grid">
          <div className="admin-risk-overview-card">
            <strong>最近扫描</strong>
            <span className="muted">
              {overview?.last_scan.last_status === 'running'
                ? '扫描中'
                : overview?.last_scan.last_status === 'failed'
                  ? '最近失败'
                  : '最近成功'}
            </span>
            <small className="muted">
              开始：{formatAdminDateTime(overview?.last_scan.last_started_at)}
            </small>
            <small className="muted">
              结束：{formatAdminDateTime(overview?.last_scan.last_finished_at)}
            </small>
          </div>

          <div className="admin-risk-overview-card">
            <strong>扫描来源</strong>
            <span className="muted">{overview?.last_scan.last_trigger_source || '未记录'}</span>
            <small className="muted">
              更新时间：{formatAdminDateTime(overview?.last_scan.updated_at)}
            </small>
          </div>

          <div className="admin-risk-overview-card">
            <strong>最近错误</strong>
            <span className="muted admin-risk-error-text">
              {overview?.last_scan.last_error || '无'}
            </span>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 20 }}>
          <label className="field field-span-2">
            <span>手动恢复备注</span>
            <input
              type="text"
              value={releaseReason}
              onChange={(event) => setReleaseReason(event.target.value)}
              placeholder="可选，记录本次恢复原因"
            />
          </label>
        </div>

        <div className="form-actions actions">
          <button className="button primary" disabled={scanning} onClick={() => void handleManualScan()}>
            {scanning ? '扫描中...' : '立即扫描'}
          </button>
          <button className="button ghost" onClick={() => void Promise.all([refreshOverview(), loadEvents(filters)])}>
            刷新列表
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h3 className="section-title">风险事件</h3>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>事件状态</span>
            <select
              value={filters.status ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  status:
                    event.target.value === ''
                      ? undefined
                      : (event.target.value as NonNullable<AdminRiskEventQuery['status']>)
                }))
              }
            >
              <option value="">全部</option>
              <option value="active">封禁中</option>
              <option value="pending_release">待人工恢复</option>
              <option value="released">已恢复</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p className="loading-text">正在加载风险事件...</p>
        ) : !list || list.items.length === 0 ? (
          <div className="empty-state">当前没有风险事件。</div>
        ) : (
          <>
            <div className="list">
              {list.items.map((item) => (
                <article key={item.id} className="list-item admin-risk-item">
                  <div className="stack">
                    <strong>{item.sub2apiUsername || item.sub2apiEmail}</strong>
                    <span className="muted admin-redeem-meta">{item.sub2apiEmail}</span>
                    <span className="muted admin-redeem-meta">
                      sub2api #{item.sub2apiUserId}
                      {item.linuxdoSubject ? ` · ${item.linuxdoSubject}` : ''}
                    </span>
                  </div>

                  <div className="stack">
                    {renderRiskStatus(item.status)}
                    <span className="muted admin-redeem-meta">
                      最短锁定至 {formatAdminDateTime(item.minimumLockUntil)}
                    </span>
                    <span className="muted admin-redeem-meta">
                      角色 {item.sub2apiRole} · 状态 {item.sub2apiStatus || '未知'}
                    </span>
                  </div>

                  <div className="stack">
                    <strong>{item.distinctIpCount} 个不同 IP</strong>
                    <div className="admin-risk-evidence">
                      {item.ipSamples.map((ip) => (
                        <span key={ip} className="chip admin-risk-chip">
                          {ip}
                        </span>
                      ))}
                    </div>
                    <span className="muted admin-redeem-meta">
                      窗口 {formatAdminDateTime(item.windowStartedAt)} - {formatAdminDateTime(item.windowEndedAt)}
                    </span>
                  </div>

                  <div className="stack">
                    {renderSyncStatus(item.mainSiteSyncStatus)}
                    <span className="muted admin-redeem-meta">
                      首次命中 {formatAdminDateTime(item.firstHitAt)}
                    </span>
                    <span className="muted admin-redeem-meta">
                      最近命中 {formatAdminDateTime(item.lastHitAt)}
                    </span>
                    {item.mainSiteSyncError && (
                      <span className="admin-checkin-error failed">{item.mainSiteSyncError}</span>
                    )}
                  </div>

                  <div className="stack">
                    <span className="muted admin-redeem-meta">
                      最近扫描 {formatAdminDateTime(item.lastScannedAt)}
                    </span>
                    <span className="muted admin-redeem-meta">
                      来源 {item.lastScanSource || '未记录'} · 状态 {item.lastScanStatus}
                    </span>
                    {item.releasedAt && (
                      <span className="muted admin-redeem-meta">
                        已恢复 {formatAdminDateTime(item.releasedAt)}
                      </span>
                    )}
                    {item.releaseReason && (
                      <span className="muted admin-redeem-meta">
                        备注 {item.releaseReason}
                      </span>
                    )}
                  </div>

                  <div className="actions admin-risk-actions">
                    {item.status === 'pending_release' ? (
                      <button
                        className="button primary"
                        disabled={releasingId === item.id}
                        onClick={() => void handleRelease(item)}
                      >
                        {releasingId === item.id ? '恢复中...' : '手动恢复'}
                      </button>
                    ) : (
                      <button className="button ghost" disabled>
                        {item.status === 'active' ? '锁定中' : '已完成'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="pagination-bar">
              <span className="muted">
                第 {list.page} / {list.pages} 页，共 {list.total} 条
              </span>
              <div className="actions">
                <button
                  className="button ghost"
                  disabled={list.page <= 1}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      page: Math.max(1, (current.page ?? 1) - 1)
                    }))
                  }
                >
                  上一页
                </button>
                <button
                  className="button ghost"
                  disabled={list.page >= list.pages}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      page: Math.min(list.pages, (current.page ?? 1) + 1)
                    }))
                  }
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

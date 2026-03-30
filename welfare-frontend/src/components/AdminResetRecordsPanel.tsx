import { useEffect, useMemo, useState } from 'react';
import { api, isUnauthorizedError } from '../lib/api';
import { formatAdminTime } from '../lib/admin-format';
import type {
  AdminResetRecordList,
  AdminResetRecordQuery,
  AdminSettings
} from '../types';
import { renderGrantTag } from '../lib/welfare-display';

const defaultFilters: AdminResetRecordQuery = {
  page: 1,
  page_size: 10
};

const defaultFilterForm = {
  subject: '',
  grant_status: '' as '' | 'pending' | 'success' | 'failed',
  date_from: '',
  date_to: ''
};

interface AdminResetRecordsPanelProps {
  settings: AdminSettings | null;
  onSettingsChange: (next: AdminSettings) => void;
  onUnauthorized: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function AdminResetRecordsPanel({
  settings,
  onSettingsChange,
  onUnauthorized,
  onError,
  onSuccess
}: AdminResetRecordsPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('20');
  const [targetInput, setTargetInput] = useState('200');
  const [cooldownInput, setCooldownInput] = useState('7');
  const [noticeInput, setNoticeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<AdminResetRecordQuery>(defaultFilters);
  const [filterForm, setFilterForm] = useState(defaultFilterForm);
  const [records, setRecords] = useState<AdminResetRecordList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setEnabled(settings.reset_enabled);
    setThresholdInput(String(settings.reset_threshold_balance));
    setTargetInput(String(settings.reset_target_balance));
    setCooldownInput(String(settings.reset_cooldown_days));
    setNoticeInput(settings.reset_notice);
  }, [settings]);

  useEffect(() => {
    void loadRecords(filters);
  }, [filters]);

  const summary = useMemo(() => {
    const items = records?.items ?? [];
    return {
      totalGranted: items.reduce((sum, item) => sum + item.grantedBalance, 0),
      successCount: items.filter((item) => item.grantStatus === 'success').length,
      failedCount: items.filter((item) => item.grantStatus === 'failed').length
    };
  }, [records]);

  async function loadRecords(nextFilters: AdminResetRecordQuery) {
    setLoading(true);
    try {
      const result = await api.listAdminResetRecords(nextFilters);
      setRecords(result);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }

      onError(err instanceof Error ? err.message : '重置记录加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) {
      return;
    }

    const threshold = Number(thresholdInput);
    const target = Number(targetInput);
    const cooldown = Number(cooldownInput);

    if (!Number.isFinite(threshold) || threshold < 0) {
      onError('重置阈值必须大于等于 0');
      return;
    }

    if (!Number.isFinite(target) || target <= threshold) {
      onError('重置目标值必须大于重置阈值');
      return;
    }

    if (!Number.isInteger(cooldown) || cooldown < 0) {
      onError('冷却天数必须是大于等于 0 的整数');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateAdminSettings({
        ...settings,
        reset_enabled: enabled,
        reset_threshold_balance: threshold,
        reset_target_balance: target,
        reset_cooldown_days: cooldown,
        reset_notice: noticeInput.trim()
      });
      onSettingsChange(updated);
      onSuccess('重置规则保存成功');
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }

      onError(err instanceof Error ? err.message : '重置规则保存失败');
    } finally {
      setSaving(false);
    }
  }

  function applyFilters() {
    if (
      filterForm.date_from &&
      filterForm.date_to &&
      filterForm.date_from > filterForm.date_to
    ) {
      onError('开始日期不能晚于结束日期');
      return;
    }

    setFilters({
      page: 1,
      page_size: filters.page_size ?? defaultFilters.page_size,
      subject: filterForm.subject.trim() || undefined,
      grant_status: filterForm.grant_status || undefined,
      date_from: filterForm.date_from || undefined,
      date_to: filterForm.date_to || undefined
    });
  }

  return (
    <div className="admin-reset-stack">
      <section className="panel admin-reset-panel">
        <div className="section-head">
          <h3 className="section-title">重置规则</h3>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>功能开关</span>
            <div className="field-inline">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              <strong>{enabled ? '已开启' : '已关闭'}</strong>
            </div>
          </label>
          <label className="field">
            <span>重置阈值</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={thresholdInput}
              onChange={(event) => setThresholdInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span>目标值</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={targetInput}
              onChange={(event) => setTargetInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span>冷却天数</span>
            <input
              type="number"
              min="0"
              step="1"
              value={cooldownInput}
              onChange={(event) => setCooldownInput(event.target.value)}
            />
          </label>
          <label className="field field-span-2">
            <span>用户提示文案</span>
            <input
              type="text"
              value={noticeInput}
              onChange={(event) => setNoticeInput(event.target.value)}
              placeholder="当当前余额低于阈值时，可直接补到目标值。"
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="button primary" disabled={saving} onClick={saveSettings}>
            {saving ? '保存中...' : '保存重置规则'}
          </button>
        </div>
      </section>

      <section className="panel admin-reset-panel">
        <div className="section-head">
          <h3 className="section-title">重置记录</h3>
        </div>

        <div className="admin-stats-summary">
          <span className="chip">当前页补差总额：{summary.totalGranted.toFixed(2)}</span>
          <span className="chip">成功：{summary.successCount}</span>
          <span className="chip">失败：{summary.failedCount}</span>
          <span className="chip">总记录：{records?.total ?? 0}</span>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>用户关键字</span>
            <input
              type="text"
              value={filterForm.subject}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, subject: event.target.value }))
              }
              placeholder="subject / 邮箱 / 用户名"
            />
          </label>
          <label className="field">
            <span>状态</span>
            <select
              value={filterForm.grant_status}
              onChange={(event) =>
                setFilterForm((current) => ({
                  ...current,
                  grant_status: event.target.value as typeof current.grant_status
                }))
              }
            >
              <option value="">全部</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="pending">处理中</option>
            </select>
          </label>
          <label className="field">
            <span>开始日期</span>
            <input
              type="date"
              value={filterForm.date_from}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, date_from: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>结束日期</span>
            <input
              type="date"
              value={filterForm.date_to}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, date_to: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="form-actions admin-filter-actions">
          <button className="button primary" onClick={applyFilters}>
            应用筛选
          </button>
          <button
            className="button ghost"
            onClick={() => {
              setFilterForm(defaultFilterForm);
              setFilters(defaultFilters);
            }}
          >
            重置筛选
          </button>
        </div>

        {loading ? (
          <p className="loading-text">加载中...</p>
        ) : !records || records.items.length === 0 ? (
          <div className="empty-state">暂无重置记录</div>
        ) : (
          <>
            <div className="list">
              {records.items.map((item) => (
                <div key={item.id} className="list-item admin-reset-item">
                  <div className="stack">
                    <strong>{item.sub2apiUsername || item.sub2apiEmail}</strong>
                    <span className="muted admin-redeem-meta">
                      {item.sub2apiEmail}
                    </span>
                    <span className="muted admin-redeem-meta">
                      {item.linuxdoSubject || '未绑定 LinuxDo'} · {formatAdminTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="stack">
                    <strong>{item.beforeBalance.toFixed(2)} → {item.targetBalance.toFixed(2)}</strong>
                    <span className="muted admin-redeem-meta">
                      补差 {item.grantedBalance.toFixed(2)}
                    </span>
                  </div>
                  {renderGrantTag(item.grantStatus)}
                  <div className="stack">
                    <strong>{item.newBalance != null ? item.newBalance.toFixed(2) : '--'}</strong>
                    <span className="muted admin-redeem-meta">
                      冷却 {item.cooldownDays} 天
                    </span>
                  </div>
                  <div className="stack">
                    <span className="muted admin-redeem-meta">{item.idempotencyKey}</span>
                    {item.grantError && (
                      <span className="admin-checkin-error failed">{item.grantError}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pagination-bar">
              <span className="muted">
                第 {records.page} / {records.pages} 页，共 {records.total} 条
              </span>
              <div className="actions">
                <button
                  className="button"
                  disabled={records.page <= 1}
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
                  className="button"
                  disabled={records.page >= records.pages}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      page: Math.min(records.pages, (current.page ?? 1) + 1)
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

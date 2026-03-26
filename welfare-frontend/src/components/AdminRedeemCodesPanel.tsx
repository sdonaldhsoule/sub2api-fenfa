import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { formatAdminDateTime } from '../lib/admin-format';
import { api, isUnauthorizedError } from '../lib/api';
import type { AdminRedeemCodeItem } from '../types';

interface AdminRedeemCodesPanelProps {
  onUnauthorized: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onCodesChanged?: () => Promise<void>;
}

const initialCreateForm = {
  code: '',
  title: '',
  reward_balance: '100',
  max_claims: '10',
  enabled: true,
  expires_at: '',
  notes: ''
};

const initialEditForm = {
  title: '',
  enabled: true,
  expires_at: '',
  notes: ''
};

function toIsoDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '长期有效';
  }
  return formatAdminDateTime(value);
}

function buildEditForm(item: AdminRedeemCodeItem) {
  return {
    title: item.title,
    enabled: item.enabled,
    expires_at: toDateTimeLocalValue(item.expiresAt),
    notes: item.notes
  };
}

export function AdminRedeemCodesPanel({
  onUnauthorized,
  onError,
  onSuccess,
  onCodesChanged
}: AdminRedeemCodesPanelProps) {
  const [codes, setCodes] = useState<AdminRedeemCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [form, setForm] = useState(initialCreateForm);
  const [editForm, setEditForm] = useState(initialEditForm);

  const enabledCount = useMemo(
    () => codes.filter((item) => item.enabled && !item.isExpired).length,
    [codes]
  );
  const expiredCount = useMemo(
    () => codes.filter((item) => item.isExpired).length,
    [codes]
  );
  const editingItem = useMemo(
    () => codes.find((item) => item.id === editingId) ?? null,
    [codes, editingId]
  );

  function replaceCode(updated: AdminRedeemCodeItem) {
    setCodes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function loadCodes() {
    setLoading(true);
    try {
      onError('');
      const result = await api.listAdminRedeemCodes();
      setCodes(result);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '兑换码列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCodes();
  }, []);

  async function handleCreateCode() {
    const rewardBalance = Number(form.reward_balance);
    const maxClaims = Number(form.max_claims);
    if (!form.code.trim() || !form.title.trim()) {
      onSuccess('');
      onError('兑换码和标题不能为空');
      return;
    }
    if (!Number.isFinite(rewardBalance) || rewardBalance <= 0) {
      onSuccess('');
      onError('发放额度必须大于 0');
      return;
    }
    if (!Number.isInteger(maxClaims) || maxClaims <= 0) {
      onSuccess('');
      onError('领取人数必须是正整数');
      return;
    }
    if (form.expires_at && !toIsoDateTime(form.expires_at)) {
      onSuccess('');
      onError('过期时间格式非法');
      return;
    }

    setSaving(true);
    try {
      const created = await api.createAdminRedeemCode({
        code: form.code.trim(),
        title: form.title.trim(),
        reward_balance: rewardBalance,
        max_claims: maxClaims,
        enabled: form.enabled,
        expires_at: toIsoDateTime(form.expires_at),
        notes: form.notes.trim() || undefined
      });
      setCodes((current) => [created, ...current]);
      setForm(initialCreateForm);
      onError('');
      if (onCodesChanged) {
        await onCodesChanged();
      }
      onSuccess(`已创建兑换码 ${created.code}`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '兑换码创建失败');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCode(item: AdminRedeemCodeItem) {
    setTogglingId(item.id);
    try {
      const updated = await api.updateAdminRedeemCode(item.id, {
        enabled: !item.enabled
      });
      replaceCode(updated);
      if (editingId === item.id) {
        setEditForm(buildEditForm(updated));
      }
      onError('');
      if (onCodesChanged) {
        await onCodesChanged();
      }
      onSuccess(`${updated.code} 已${updated.enabled ? '启用' : '停用'}`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '兑换码状态更新失败');
    } finally {
      setTogglingId(null);
    }
  }

  function startEdit(item: AdminRedeemCodeItem) {
    setEditingId(item.id);
    setEditForm(buildEditForm(item));
    onError('');
    onSuccess('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(initialEditForm);
  }

  async function saveEdit() {
    if (!editingItem) {
      return;
    }
    if (!editForm.title.trim()) {
      onSuccess('');
      onError('展示标题不能为空');
      return;
    }
    if (editForm.expires_at && !toIsoDateTime(editForm.expires_at)) {
      onSuccess('');
      onError('过期时间格式非法');
      return;
    }

    setUpdatingId(editingItem.id);
    try {
      const updated = await api.updateAdminRedeemCode(editingItem.id, {
        title: editForm.title.trim(),
        enabled: editForm.enabled,
        expires_at: editForm.expires_at ? toIsoDateTime(editForm.expires_at) : null,
        notes: editForm.notes.trim()
      });
      replaceCode(updated);
      setEditingId(null);
      setEditForm(initialEditForm);
      onError('');
      if (onCodesChanged) {
        await onCodesChanged();
      }
      onSuccess(`已更新兑换码 ${updated.code}`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '兑换码更新失败');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      <div className="admin-section-head">
        <div>
          <span className="admin-surface-kicker">Redeem Assets</span>
          <h2 className="admin-section-title">兑换码资产池</h2>
          <p className="admin-section-copy">创建活动码、控制人数和过期节奏，把一次性运营动作变成可复用资产。</p>
        </div>
      </div>

      <div className="panel">
        <div className="form-grid">
          <label className="field">
            <span>兑换码</span>
            <input
              type="text"
              value={form.code}
              maxLength={64}
              placeholder="例如 WELFARE100"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  code: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>展示标题</span>
            <input
              type="text"
              value={form.title}
              maxLength={120}
              placeholder="例如 福利100刀兑换"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>单次发放额度</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.reward_balance}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reward_balance: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>最多领取人数</span>
            <input
              type="number"
              step="1"
              min="1"
              value={form.max_claims}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  max_claims: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>过期时间</span>
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expires_at: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>备注</span>
            <input
              type="text"
              value={form.notes}
              maxLength={500}
              placeholder="可选"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>启用状态</span>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  enabled: event.target.checked
                }))
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="button primary" onClick={handleCreateCode} disabled={saving}>
            {saving ? '创建中...' : '创建兑换码'}
          </button>
        </div>
      </div>

      {editingItem && (
        <div className="panel">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title-content">
                <Icon name="settings" className="icon icon-accent" />
                <span>编辑兑换码 {editingItem.code}</span>
              </span>
            </h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>展示标题</span>
              <input
                type="text"
                value={editForm.title}
                maxLength={120}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>过期时间</span>
              <input
                type="datetime-local"
                value={editForm.expires_at}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    expires_at: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>备注</span>
              <input
                type="text"
                value={editForm.notes}
                maxLength={500}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    notes: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>启用状态</span>
              <input
                type="checkbox"
                checked={editForm.enabled}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    enabled: event.target.checked
                  }))
                }
              />
            </label>
          </div>
          <div className="form-actions actions">
            <button className="button primary" onClick={() => void saveEdit()} disabled={updatingId === editingItem.id}>
              {updatingId === editingItem.id ? '保存中...' : '保存修改'}
            </button>
            <button className="button ghost" onClick={cancelEdit} disabled={updatingId === editingItem.id}>
              取消编辑
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="admin-stats-summary">
          <span className="chip">总兑换码：{codes.length}</span>
          <span className="chip">活跃中：{enabledCount}</span>
          <span className="chip">已过期：{expiredCount}</span>
        </div>
        {loading ? (
          <p className="loading-text">正在加载兑换码...</p>
        ) : codes.length === 0 ? (
          <div className="empty-state">暂无兑换码</div>
        ) : (
          <div className="list">
            {codes.map((item) => (
              <div key={item.id} className="list-item admin-redeem-code-item">
                <div className="stack">
                  <strong>{item.title}</strong>
                  <span className="muted admin-redeem-meta">{item.code}</span>
                  <span className="muted admin-redeem-meta">
                    创建于 {formatAdminDateTime(item.createdAt)}
                  </span>
                </div>

                <div className="stack">
                  <strong>{item.rewardBalance}</strong>
                  <span className="muted admin-redeem-meta">单次发放额度</span>
                </div>

                <div className="stack">
                  <strong>
                    {item.claimedCount} / {item.maxClaims}
                  </strong>
                  <span className="muted admin-redeem-meta">
                    剩余 {item.remainingClaims}
                  </span>
                  <div className="admin-progress-track">
                    <span
                      style={{
                        width: `${Math.min(100, (item.claimedCount / item.maxClaims) * 100)}%`
                      }}
                    />
                  </div>
                </div>

                <div className="stack">
                  <span className={`status-tag ${item.enabled ? 'success' : 'failed'}`}>
                    {item.enabled ? '已启用' : '已停用'}
                  </span>
                  {item.isExpired && <span className="status-tag failed">已过期</span>}
                </div>

                <div className="stack">
                  <span className="muted admin-redeem-meta">
                    {formatDateTime(item.expiresAt)}
                  </span>
                  <span className="muted admin-redeem-meta">{item.notes || '无备注'}</span>
                </div>

                <div className="actions admin-checkin-actions">
                  <button className="button ghost" onClick={() => startEdit(item)}>
                    {editingId === item.id ? '编辑中' : '编辑'}
                  </button>
                  <button
                    className={`button ${item.enabled ? 'danger' : 'primary'}`}
                    onClick={() => void toggleCode(item)}
                    disabled={togglingId === item.id}
                  >
                    {togglingId === item.id
                      ? '处理中...'
                      : item.enabled
                        ? '停用'
                        : '启用'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

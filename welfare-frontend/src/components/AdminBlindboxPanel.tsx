import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { formatAdminDateTime } from '../lib/admin-format';
import { api, isUnauthorizedError } from '../lib/api';
import type { AdminBlindboxItem } from '../types';

interface AdminBlindboxPanelProps {
  blindboxEnabled: boolean;
  onUnauthorized: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onToggleBlindboxEnabled?: (next: boolean) => void;
}

const initialForm = {
  title: '',
  reward_balance: '10',
  weight: '10',
  enabled: true,
  notes: '',
  sort_order: '0'
};

const initialEditForm = {
  title: '',
  reward_balance: '10',
  weight: '10',
  enabled: true,
  notes: '',
  sort_order: '0'
};

function calculateExpectedValue(items: AdminBlindboxItem[]) {
  const enabledItems = items.filter((item) => item.enabled);
  const totalWeight = enabledItems.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return 0;
  }
  return enabledItems.reduce(
    (sum, item) => sum + (item.reward_balance * item.weight) / totalWeight,
    0
  );
}

function minReward(items: AdminBlindboxItem[]) {
  const enabledItems = items.filter((item) => item.enabled);
  if (enabledItems.length === 0) return null;
  return Math.min(...enabledItems.map((item) => item.reward_balance));
}

function maxReward(items: AdminBlindboxItem[]) {
  const enabledItems = items.filter((item) => item.enabled);
  if (enabledItems.length === 0) return null;
  return Math.max(...enabledItems.map((item) => item.reward_balance));
}

export function AdminBlindboxPanel({
  blindboxEnabled,
  onUnauthorized,
  onError,
  onSuccess,
  onToggleBlindboxEnabled
}: AdminBlindboxPanelProps) {
  const [items, setItems] = useState<AdminBlindboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [editForm, setEditForm] = useState(initialEditForm);

  const enabledItems = useMemo(() => items.filter((item) => item.enabled), [items]);
  const expectedValue = useMemo(() => calculateExpectedValue(items), [items]);
  const currentItem = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [editingId, items]
  );

  async function loadItems() {
    setLoading(true);
    try {
      onError('');
      const data = await api.listAdminBlindboxItems();
      setItems(data);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '盲盒奖池加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  async function handleCreate() {
    const rewardBalance = Number(form.reward_balance);
    const weight = Number(form.weight);
    const sortOrder = Number(form.sort_order);
    if (!form.title.trim()) {
      onSuccess('');
      onError('奖项名称不能为空');
      return;
    }
    if (!Number.isFinite(rewardBalance) || rewardBalance <= 0) {
      onSuccess('');
      onError('奖励额度必须大于 0');
      return;
    }
    if (!Number.isInteger(weight) || weight <= 0) {
      onSuccess('');
      onError('权重必须是正整数');
      return;
    }
    if (!Number.isInteger(sortOrder)) {
      onSuccess('');
      onError('排序必须是整数');
      return;
    }

    setSaving(true);
    try {
      const created = await api.createAdminBlindboxItem({
        title: form.title.trim(),
        reward_balance: rewardBalance,
        weight,
        enabled: form.enabled,
        notes: form.notes.trim() || undefined,
        sort_order: sortOrder
      });
      setItems((current) => [...current, created].sort((left, right) => left.sort_order - right.sort_order));
      setForm(initialForm);
      onError('');
      onSuccess(`已创建盲盒奖项 ${created.title}`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '盲盒奖项创建失败');
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(item: AdminBlindboxItem) {
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      reward_balance: String(item.reward_balance),
      weight: String(item.weight),
      enabled: item.enabled,
      notes: item.notes,
      sort_order: String(item.sort_order)
    });
  }

  async function saveEdit() {
    if (!currentItem) {
      return;
    }

    const rewardBalance = Number(editForm.reward_balance);
    const weight = Number(editForm.weight);
    const sortOrder = Number(editForm.sort_order);
    if (!editForm.title.trim()) {
      onSuccess('');
      onError('奖项名称不能为空');
      return;
    }
    if (!Number.isFinite(rewardBalance) || rewardBalance <= 0) {
      onSuccess('');
      onError('奖励额度必须大于 0');
      return;
    }
    if (!Number.isInteger(weight) || weight <= 0) {
      onSuccess('');
      onError('权重必须是正整数');
      return;
    }
    if (!Number.isInteger(sortOrder)) {
      onSuccess('');
      onError('排序必须是整数');
      return;
    }

    setUpdatingId(currentItem.id);
    try {
      const updated = await api.updateAdminBlindboxItem(currentItem.id, {
        title: editForm.title.trim(),
        reward_balance: rewardBalance,
        weight,
        enabled: editForm.enabled,
        notes: editForm.notes.trim() || undefined,
        sort_order: sortOrder
      });
      setItems((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((left, right) => left.sort_order - right.sort_order)
      );
      setEditingId(null);
      setEditForm(initialEditForm);
      onError('');
      onSuccess(`已更新盲盒奖项 ${updated.title}`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '盲盒奖项更新失败');
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleItem(item: AdminBlindboxItem) {
    setUpdatingId(item.id);
    try {
      const updated = await api.updateAdminBlindboxItem(item.id, {
        enabled: !item.enabled
      });
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      onError('');
      onSuccess(`${updated.title} 已${updated.enabled ? '启用' : '停用'}`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        await onUnauthorized();
        return;
      }
      onSuccess('');
      onError(err instanceof Error ? err.message : '盲盒奖项状态更新失败');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="panel">
      <div className="section-head">
        <h2 className="section-title">
          <span className="section-title-content">
            <Icon name="gift" className="icon icon-accent" />
            <span>惊喜签到奖池</span>
          </span>
        </h2>
      </div>

      <div className="admin-stats-summary">
        <span className="chip">盲盒状态：{blindboxEnabled ? '开启中' : '已关闭'}</span>
        <span className="chip">可用奖项：{enabledItems.length}</span>
        <span className="chip">奖励范围：{minReward(items) ?? '-'} ~ {maxReward(items) ?? '-'}</span>
        <span className="chip">理论期望值：{expectedValue.toFixed(2)}</span>
      </div>

      <div className="form-actions actions" style={{ marginTop: 0, marginBottom: 18 }}>
        <button
          className={`button ${blindboxEnabled ? 'danger' : 'primary'}`}
          onClick={() => {
            void onToggleBlindboxEnabled?.(!blindboxEnabled);
          }}
        >
          {blindboxEnabled ? '关闭盲盒签到' : '开启盲盒签到'}
        </button>
      </div>

      <div className="blindbox-settings-grid form-grid">
        <label className="field">
          <span>奖项名称</span>
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="例如 好运签"
          />
        </label>
        <label className="field">
          <span>奖励额度</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.reward_balance}
            onChange={(event) =>
              setForm((current) => ({ ...current, reward_balance: event.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>权重</span>
          <input
            type="number"
            step="1"
            min="1"
            value={form.weight}
            onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>排序</span>
          <input
            type="number"
            step="1"
            value={form.sort_order}
            onChange={(event) =>
              setForm((current) => ({ ...current, sort_order: event.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>备注</span>
          <input
            type="text"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="可选"
          />
        </label>
        <label className="field">
          <span>启用状态</span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
          />
        </label>
      </div>

      <div className="form-actions">
        <button className="button primary" onClick={() => void handleCreate()} disabled={saving}>
          {saving ? '创建中...' : '新增奖项'}
        </button>
      </div>

      {currentItem && (
        <div className="panel" style={{ marginTop: 22 }}>
          <div className="section-head">
            <h3 className="section-title" style={{ fontSize: 20 }}>编辑奖项 {currentItem.title}</h3>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>奖项名称</span>
              <input
                type="text"
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>奖励额度</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={editForm.reward_balance}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, reward_balance: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>权重</span>
              <input
                type="number"
                step="1"
                min="1"
                value={editForm.weight}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, weight: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>排序</span>
              <input
                type="number"
                step="1"
                value={editForm.sort_order}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, sort_order: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>备注</span>
              <input
                type="text"
                value={editForm.notes}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>启用状态</span>
              <input
                type="checkbox"
                checked={editForm.enabled}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
            </label>
          </div>
          <div className="form-actions actions">
            <button className="button primary" onClick={() => void saveEdit()} disabled={updatingId === currentItem.id}>
              {updatingId === currentItem.id ? '保存中...' : '保存修改'}
            </button>
            <button className="button ghost" onClick={() => setEditingId(null)}>
              取消编辑
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="loading-text">正在加载盲盒奖池...</p>
      ) : items.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 18 }}>当前还没有配置盲盒奖项。</div>
      ) : (
        <div className="blindbox-list-grid" style={{ marginTop: 18 }}>
          {items.map((item) => (
            <article key={item.id} className="blindbox-admin-card">
              <strong>{item.title}</strong>
              <div className="admin-stats-summary" style={{ marginBottom: 12 }}>
                <span className="chip">奖励 {item.reward_balance}</span>
                <span className="chip">权重 {item.weight}</span>
                <span className="chip">排序 {item.sort_order}</span>
              </div>
              <p className="blindbox-admin-meta">
                {item.enabled ? '已启用' : '已停用'} · {item.notes || '无备注'}
              </p>
              <p className="blindbox-admin-meta">
                更新于 {formatAdminDateTime(item.updated_at || item.created_at)}
              </p>
              <div className="form-actions actions">
                <button className="button ghost" onClick={() => beginEdit(item)}>
                  编辑
                </button>
                <button
                  className={`button ${item.enabled ? 'danger' : 'primary'}`}
                  onClick={() => void toggleItem(item)}
                  disabled={updatingId === item.id}
                >
                  {updatingId === item.id ? '处理中...' : item.enabled ? '停用' : '启用'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

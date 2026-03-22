import { Icon } from './Icon';
import { formatAdminDateTime } from '../lib/admin-format';
import type { WhitelistItem } from '../types';

interface AdminWhitelistPanelProps {
  userName: string;
  whitelist: WhitelistItem[];
  newSubject: string;
  newNotes: string;
  onSubjectChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onAdd: () => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}

export function AdminWhitelistPanel({
  userName,
  whitelist,
  newSubject,
  newNotes,
  onSubjectChange,
  onNotesChange,
  onAdd,
  onRemove
}: AdminWhitelistPanelProps) {
  return (
    <div className="admin-section-stack">
      <div className="admin-two-column">
        <div className="panel">
          <h2 className="section-title">
            <span className="section-title-content">
              <Icon name="shield" className="icon icon-accent" />
              <span>新增管理员</span>
            </span>
          </h2>
          <div className="form-grid">
            <label className="field">
              <span>LinuxDo Subject</span>
              <input
                value={newSubject}
                onChange={(event) => onSubjectChange(event.target.value)}
                placeholder="输入 LinuxDo subject"
              />
            </label>
            <label className="field">
              <span>备注</span>
              <input
                value={newNotes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="例如 运营值班号"
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="button primary" onClick={() => void onAdd()}>
              添加白名单
            </button>
          </div>
        </div>

        <div className="panel">
          <h2 className="section-title">
            <span className="section-title-content">
              <Icon name="users" className="icon icon-accent" />
              <span>权限摘要</span>
            </span>
          </h2>
          <div className="admin-stats-summary">
            <span className="chip">管理员数量：{whitelist.length}</span>
            <span className="chip">当前登录：{userName}</span>
          </div>
          <p className="muted admin-note">
            白名单以 LinuxDo subject 为准，删除后会在下一次会话校验时失去后台权限。
          </p>
        </div>
      </div>

      <div className="panel">
        <h2 className="section-title">
          <span className="section-title-content">
            <Icon name="users" className="icon icon-accent" />
            <span>管理员白名单</span>
          </span>
        </h2>
        <div className="list" style={{ marginTop: 16 }}>
          {whitelist.length === 0 && <div className="empty-state">暂无管理员白名单</div>}
          {whitelist.map((item) => (
            <div key={item.id} className="list-item admin-list-compact">
              <div className="stack">
                <strong>{item.linuxdoSubject}</strong>
                <span className="muted admin-checkin-meta">{item.notes || '无备注'}</span>
              </div>
              <span className="muted admin-checkin-meta">
                {formatAdminDateTime(item.createdAt)}
              </span>
              <button className="button danger" onClick={() => void onRemove(item.id)}>
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

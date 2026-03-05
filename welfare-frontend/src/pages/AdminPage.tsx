import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { clearToken } from '../lib/auth';
import type { AdminSettings, DailyStats, SessionUser, WhitelistItem } from '../types';

export function AdminPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [profile, settingsResp, statsResp, whitelistResp] = await Promise.all([
        api.getMe(),
        api.getAdminSettings(),
        api.getDailyStats(30),
        api.listWhitelist()
      ]);
      if (!profile.is_admin) {
        throw new Error('当前账号不在管理员白名单');
      }
      setMe(profile);
      setSettings(settingsResp);
      setStats(statsResp);
      setWhitelist(whitelistResp);
    } catch (err) {
      const text = err instanceof Error ? err.message : '加载失败';
      setError(text);
      if (text.includes('登录') || text.includes('401') || text.includes('UNAUTHORIZED')) {
        clearToken();
        setTimeout(() => navigate('/login', { replace: true }), 1000);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await api.updateAdminSettings(settings);
      setSettings(updated);
      setMessage('设置保存成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function addWhitelist() {
    if (!newSubject.trim()) return;
    setError('');
    setMessage('');
    try {
      await api.addWhitelist({
        linuxdo_subject: newSubject.trim(),
        notes: newNotes.trim() || undefined
      });
      setNewSubject('');
      setNewNotes('');
      setWhitelist(await api.listWhitelist());
      setMessage('已添加管理员白名单');
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失败');
    }
  }

  async function removeWhitelist(id: number) {
    setError('');
    setMessage('');
    try {
      await api.removeWhitelist(id);
      setWhitelist(await api.listWhitelist());
      setMessage('已删除白名单');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card">加载中...</div>
      </div>
    );
  }

  if (!me?.is_admin) {
    return (
      <div className="page">
        <div className="card">
          <h1>无权限</h1>
          <p className="error">{error || '当前账号不是管理员'}</p>
          <Link to="/checkin" className="button">
            返回签到页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="row">
          <h1>福利后台管理</h1>
          <Link to="/checkin" className="button">
            返回签到页
          </Link>
        </div>

        {error && <p className="error">{error}</p>}
        {message && <p className="ok">{message}</p>}

        <h2>签到配置</h2>
        {settings && (
          <div className="panel">
            <label className="field">
              <span>签到开关</span>
              <input
                type="checkbox"
                checked={settings.checkin_enabled}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    checkin_enabled: event.target.checked
                  })
                }
              />
            </label>

            <label className="field">
              <span>每日奖励余额</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={settings.daily_reward_balance}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    daily_reward_balance: Number(event.target.value)
                  })
                }
              />
            </label>

            <label className="field">
              <span>业务时区</span>
              <input
                type="text"
                value={settings.timezone}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    timezone: event.target.value
                  })
                }
              />
            </label>
            <button className="button primary" onClick={saveSettings} disabled={saving}>
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        )}

        <h2>30天签到统计</h2>
        {stats && (
          <div className="panel">
            <p>签到人次：{stats.total_checkins}</p>
            <p>发放总额：{stats.total_grant_balance}</p>
            <div className="list">
              {stats.points.map((point) => (
                <div key={point.checkinDate} className="list-item">
                  <strong>{point.checkinDate}</strong>
                  <span>人数: {point.checkinUsers}</span>
                  <span>发放: {point.grantTotal}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2>管理员白名单</h2>
        <div className="panel">
          <label className="field">
            <span>LinuxDo Subject</span>
            <input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} />
          </label>
          <label className="field">
            <span>备注</span>
            <input value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />
          </label>
          <button className="button" onClick={addWhitelist}>
            添加白名单
          </button>

          <div className="list">
            {whitelist.map((item) => (
              <div key={item.id} className="list-item">
                <strong>{item.linuxdoSubject}</strong>
                <span>{item.notes || '-'}</span>
                <button className="button danger" onClick={() => removeWhitelist(item.id)}>
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


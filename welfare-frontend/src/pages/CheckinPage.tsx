import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { clearToken } from '../lib/auth';
import type { CheckinHistoryItem, CheckinStatus, SessionUser } from '../types';

export function CheckinPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [history, setHistory] = useState<CheckinHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [me, currentStatus, records] = await Promise.all([
        api.getMe(),
        api.getCheckinStatus(),
        api.getCheckinHistory()
      ]);
      setUser(me);
      setStatus(currentStatus);
      setHistory(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      clearToken();
      setTimeout(() => navigate('/login', { replace: true }), 1000);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const canCheckin = useMemo(() => {
    if (!status) return false;
    return status.checkin_enabled && !status.checked_in && !submitting;
  }, [status, submitting]);

  async function handleCheckin() {
    if (!canCheckin) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.checkin();
      setSuccess(
        `签到成功，已发放 ${result.reward_balance}，当前余额 ${result.new_balance ?? '未知'}`
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '签到失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // 忽略登出接口错误，前端本地态仍然清理。
    }
    clearToken();
    navigate('/login', { replace: true });
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card">加载中...</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="row">
          <h1>每日签到</h1>
          <button className="button" onClick={handleLogout}>
            退出
          </button>
        </div>
        <p className="muted">
          用户：{user?.username}（sub2api 用户ID: {user?.sub2api_user_id}）
        </p>
        {user?.is_admin && (
          <p className="muted">
            你是管理员，前往 <Link to="/admin">后台管理</Link>
          </p>
        )}

        {status && (
          <div className="panel">
            <p>业务日：{status.checkin_date}</p>
            <p>时区：{status.timezone}</p>
            <p>今日奖励：{status.daily_reward_balance}</p>
            <p>签到状态：{status.checked_in ? '已签到' : '未签到'}</p>
          </div>
        )}

        <button className="button primary" disabled={!canCheckin} onClick={handleCheckin}>
          {submitting ? '签到中...' : '立即签到'}
        </button>

        {success && <p className="ok">{success}</p>}
        {error && <p className="error">{error}</p>}

        <h2>签到历史</h2>
        <div className="list">
          {history.length === 0 && <p className="muted">暂无签到记录</p>}
          {history.map((item) => (
            <div key={item.id} className="list-item">
              <strong>{item.checkin_date}</strong>
              <span>{item.reward_balance}</span>
              <span>{item.grant_status}</span>
              <span>{new Date(item.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


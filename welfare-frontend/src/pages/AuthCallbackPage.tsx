import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../lib/auth';

function parseHash(hash: string): Record<string, string> {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalized);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('正在处理登录回调...');

  useEffect(() => {
    const params = parseHash(window.location.hash);
    const error = params.error;
    const token = params.token;
    const redirect = params.redirect || '/checkin';

    if (error) {
      setMessage(`登录失败：${params.detail || error}`);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
      return;
    }
    if (!token) {
      setMessage('登录失败：缺少 token');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
      return;
    }

    setToken(token);
    navigate(redirect, { replace: true });
  }, [navigate]);

  return (
    <div className="page">
      <div className="card">
        <h1>登录回调</h1>
        <p className="muted">{message}</p>
      </div>
    </div>
  );
}


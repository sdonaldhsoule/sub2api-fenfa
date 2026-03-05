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
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const params = parseHash(window.location.hash);
    const error = params.error;
    const token = params.token;
    const redirect = params.redirect || '/checkin';

    if (error) {
      setIsError(true);
      setMessage(`登录失败：${params.detail || error}`);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
      return;
    }
    if (!token) {
      setIsError(true);
      setMessage('登录失败：缺少 token');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
      return;
    }

    setToken(token);
    setMessage('登录成功，正在跳转...');
    navigate(redirect, { replace: true });
  }, [navigate]);

  return (
    <div className="page page-center">
      <div className="card auth-card">
        <span className="eyebrow">auth gateway</span>
        <h1 className="hero-title">登录回调</h1>
        <p className={isError ? 'alert error' : 'alert success'}>{message}</p>
      </div>
    </div>
  );
}

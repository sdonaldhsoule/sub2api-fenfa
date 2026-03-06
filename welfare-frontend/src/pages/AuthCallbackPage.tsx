import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

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
  const { refresh } = useAuth();
  const [message, setMessage] = useState('正在处理登录回调...');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const params = parseHash(window.location.hash);
    const error = params.error;
    const redirect = params.redirect || '/checkin';

    if (error) {
      setIsError(true);
      setMessage(`登录失败：${params.detail || error}`);
      const timeout = window.setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;

    void refresh()
      .then((user) => {
        if (cancelled) {
          return;
        }
        if (!user) {
          setIsError(true);
          setMessage('登录失败：未建立有效会话');
          window.setTimeout(() => {
            navigate('/login', { replace: true });
          }, 1500);
          return;
        }
        setMessage('登录成功，正在跳转...');
        navigate(redirect, { replace: true });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setIsError(true);
        setMessage('登录失败：会话校验未通过，请稍后重试');
        window.setTimeout(() => {
          navigate('/login', { replace: true });
        }, 1500);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, refresh]);

  return (
    <div className="page page-center">
      <div className="card auth-card">
        <span className="eyebrow">身份认证</span>
        <h1 className="hero-title">登录回调</h1>
        <p className={isError ? 'alert error' : 'alert success'}>{message}</p>
      </div>
    </div>
  );
}

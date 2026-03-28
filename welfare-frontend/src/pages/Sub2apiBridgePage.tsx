import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { resolveAppPath } from '../lib/app-base';
import { storeSessionToken } from '../lib/session-token';
import {
  captureSub2apiBridgeParams,
  clearSub2apiBridgeParams
} from '../lib/sub2api-bridge';

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function verifySessionToken(sessionToken: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    storeSessionToken(sessionToken);

    try {
      const verifiedUser = await api.getMe(sessionToken);
      if (verifiedUser) {
        return true;
      }
    } catch {
      // 忽略单次校验失败，做短重试
    }

    if (attempt < 4) {
      await wait(200 * (attempt + 1));
    }
  }

  return false;
}

export function Sub2apiBridgePage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('正在接入 sub2api 登录态...');
  const [isError, setIsError] = useState(false);
  const bridgeHandledRef = useRef(false);
  const bridgeCapture = useMemo(
    () => captureSub2apiBridgeParams(window.location.search),
    []
  );

  useEffect(() => {
    let cancelled = false;

    if (bridgeCapture.shouldClearUrl) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    const token = bridgeCapture.params.token;
    const redirect = bridgeCapture.params.redirect || '/checkin';
    const userId = bridgeCapture.params.userId;

    if (token && !bridgeHandledRef.current) {
      bridgeHandledRef.current = true;
      setIsError(false);
      setMessage('正在验证 sub2api 登录态并建立福利站会话...');

      void (async () => {
        try {
          const result = await api.exchangeSub2apiSession({
            access_token: token,
            user_id: userId,
            redirect
          });
          if (cancelled) {
            return;
          }

          storeSessionToken(result.session_token);
          const verified = await verifySessionToken(result.session_token);
          if (cancelled) {
            return;
          }

          if (!verified) {
            clearSub2apiBridgeParams();
            setIsError(true);
            setMessage('免登录失败：会话建立后校验未通过，请重新登录');
            return;
          }

          clearSub2apiBridgeParams();
          setMessage('登录成功，正在跳转签到页...');
          window.location.replace(resolveAppPath(result.redirect || redirect));
        } catch (error) {
          if (cancelled) {
            return;
          }

          clearSub2apiBridgeParams();
          setIsError(true);
          setMessage(
            `免登录失败：${
              error instanceof Error ? error.message : '服务暂时不可用，请稍后重试'
            }`
          );
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    clearSub2apiBridgeParams();
    setIsError(true);
    setMessage('免登录失败：未拿到有效的 sub2api 登录参数');
    const timeout = window.setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1500);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [bridgeCapture.params.redirect, bridgeCapture.params.token, bridgeCapture.params.userId, bridgeCapture.shouldClearUrl, navigate]);

  return (
    <div className="page page-center">
      <div className="card auth-card">
        <span className="eyebrow">身份认证</span>
        <h1 className="hero-title">sub2api 免登录</h1>
        <p className={isError ? 'alert error' : 'alert success'}>{message}</p>
        {isError && (
          <button
            className="button"
            style={{ marginTop: 12 }}
            onClick={() => {
              clearSub2apiBridgeParams();
              navigate('/login', { replace: true });
            }}
          >
            返回登录
          </button>
        )}
      </div>
    </div>
  );
}

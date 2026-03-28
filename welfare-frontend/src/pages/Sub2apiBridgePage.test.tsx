import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sub2apiBridgePage } from './Sub2apiBridgePage';
import { SESSION_TOKEN_STORAGE_KEY } from '../lib/session-token';

const exchangeSub2apiSessionMock = vi.fn();
const getMeMock = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    exchangeSub2apiSession: (...args: unknown[]) => exchangeSub2apiSessionMock(...args),
    getMe: (...args: unknown[]) => getMeMock(...args)
  }
}));

describe('Sub2apiBridgePage', () => {
  beforeEach(() => {
    exchangeSub2apiSessionMock.mockReset();
    getMeMock.mockReset();
    getMeMock.mockResolvedValue({
      sub2api_user_id: 7,
      email: 'normal-user@example.com',
      linuxdo_subject: null,
      username: 'normal-user',
      avatar_url: null,
      is_admin: false
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(
      {},
      '',
      '/auth/sub2api-bridge?token=sub2api-token&user_id=7&redirect=%2Fcheckin'
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('会使用 sub2api token 建立福利站会话并跳转到目标页', async () => {
    exchangeSub2apiSessionMock.mockResolvedValue({
      session_token: 'bridge-session-token',
      redirect: '/checkin'
    });

    render(
      <MemoryRouter
        initialEntries={['/auth/sub2api-bridge']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/auth/sub2api-bridge" element={<Sub2apiBridgePage />} />
          <Route path="/checkin" element={<div>签到页</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(exchangeSub2apiSessionMock).toHaveBeenCalledWith({
        access_token: 'sub2api-token',
        user_id: 7,
        redirect: '/checkin'
      });
    });
    await waitFor(() => {
      expect(getMeMock).toHaveBeenCalledWith('bridge-session-token');
    });
    await waitFor(() => {
      expect(screen.getByText('登录成功，正在跳转签到页...')).toBeInTheDocument();
    });

    expect(window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBe('bridge-session-token');
    expect(window.location.search).toBe('');
  });
});

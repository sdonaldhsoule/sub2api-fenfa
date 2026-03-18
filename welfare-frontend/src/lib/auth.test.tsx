import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';

const getMeMock = vi.fn();
const logoutMock = vi.fn();

vi.mock('./api', () => ({
  api: {
    getMe: (...args: unknown[]) => getMeMock(...args),
    logout: (...args: unknown[]) => logoutMock(...args)
  },
  isUnauthorizedError: (error: unknown) =>
    Boolean((error as { status?: number } | null)?.status === 401)
}));

function AuthProbe() {
  const { status, error } = useAuth();

  return (
    <div>
      {status}|{error ?? '-'}
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    getMeMock.mockReset();
    logoutMock.mockReset();
  });

  it('把非 401 的会话恢复异常保留为明确错误态', async () => {
    getMeMock.mockRejectedValue(new Error('backend down'));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('error|backend down')).toBeInTheDocument();
    });
  });
});

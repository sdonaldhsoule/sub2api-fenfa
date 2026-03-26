import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRedeemCodesPanel } from './AdminRedeemCodesPanel';

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    listAdminRedeemCodes: vi.fn(),
    createAdminRedeemCode: vi.fn(),
    updateAdminRedeemCode: vi.fn()
  }
}));

vi.mock('../lib/api', () => ({
  api: mockApi,
  isUnauthorizedError: () => false
}));

describe('AdminRedeemCodesPanel', () => {
  beforeEach(() => {
    Object.values(mockApi).forEach((fn) => fn.mockReset());

    mockApi.listAdminRedeemCodes.mockResolvedValue([
      {
        id: 1,
        code: 'WELCOME100',
        title: '欢迎礼包',
        rewardBalance: 100,
        maxClaims: 10,
        claimedCount: 3,
        remainingClaims: 7,
        enabled: true,
        expiresAt: null,
        isExpired: false,
        notes: '初始备注',
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T00:00:00.000Z'
      }
    ]);
  });

  it('支持编辑兑换码标题、备注和过期时间', async () => {
    mockApi.updateAdminRedeemCode.mockResolvedValue({
      id: 1,
      code: 'WELCOME100',
      title: '欢迎礼包 Pro',
      rewardBalance: 100,
      maxClaims: 10,
      claimedCount: 3,
      remainingClaims: 7,
      enabled: false,
      expiresAt: '2026-04-01T04:30:00.000Z',
      isExpired: false,
      notes: '已更新备注',
      createdAt: '2026-03-26T00:00:00.000Z',
      updatedAt: '2026-03-26T01:00:00.000Z'
    });

    const onError = vi.fn();
    const onSuccess = vi.fn();
    const onUnauthorized = vi.fn().mockResolvedValue(undefined);
    const onCodesChanged = vi.fn().mockResolvedValue(undefined);

    render(
      <AdminRedeemCodesPanel
        onUnauthorized={onUnauthorized}
        onError={onError}
        onSuccess={onSuccess}
        onCodesChanged={onCodesChanged}
      />
    );

    expect(await screen.findByText('WELCOME100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    fireEvent.change(screen.getAllByLabelText('展示标题')[1]!, {
      target: { value: '欢迎礼包 Pro' }
    });
    fireEvent.change(screen.getAllByLabelText('备注')[1]!, {
      target: { value: '已更新备注' }
    });
    fireEvent.change(screen.getAllByLabelText('过期时间')[1]!, {
      target: { value: '2026-04-01T12:30' }
    });
    fireEvent.click(screen.getAllByLabelText('启用状态')[1]!);

    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(mockApi.updateAdminRedeemCode).toHaveBeenCalledWith(1, {
        title: '欢迎礼包 Pro',
        enabled: false,
        expires_at: '2026-04-01T04:30:00.000Z',
        notes: '已更新备注'
      });
    });

    expect(onCodesChanged).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('已更新兑换码 WELCOME100');
    expect(await screen.findByText('欢迎礼包 Pro')).toBeInTheDocument();
  });
});

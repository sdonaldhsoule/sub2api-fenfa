import { clearToken, getToken } from './auth';
import type {
  AdminSettings,
  ApiEnvelope,
  CheckinHistoryItem,
  CheckinStatus,
  DailyStats,
  SessionUser,
  WhitelistItem
} from '../types';

const apiBase = import.meta.env.VITE_WELFARE_API_BASE?.replace(/\/+$/, '') || '';

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers ?? {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: 'include'
  });

  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || body.code !== 0) {
    if (response.status === 401) {
      clearToken();
    }
    throw new Error(body.detail || body.message || '请求失败');
  }
  return body.data;
}

export const api = {
  getMe: () => request<SessionUser>('/api/auth/me'),
  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),
  getCheckinStatus: () => request<CheckinStatus>('/api/checkin/status'),
  checkin: () =>
    request<{
      checkin_date: string;
      reward_balance: number;
      new_balance: number | null;
      grant_status: 'success';
    }>('/api/checkin', { method: 'POST' }),
  getCheckinHistory: () => request<CheckinHistoryItem[]>('/api/checkin/history'),
  getAdminSettings: () => request<AdminSettings>('/api/admin/settings'),
  updateAdminSettings: (payload: Partial<AdminSettings>) =>
    request<AdminSettings>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  getDailyStats: (days: number) => request<DailyStats>(`/api/admin/stats/daily?days=${days}`),
  listWhitelist: () => request<WhitelistItem[]>('/api/admin/whitelist'),
  addWhitelist: (payload: { linuxdo_subject: string; notes?: string }) =>
    request<WhitelistItem>('/api/admin/whitelist', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  removeWhitelist: (id: number) =>
    request<{ deleted: boolean }>(`/api/admin/whitelist/${id}`, {
      method: 'DELETE'
    })
};

export function buildLinuxDoStartUrl(redirectPath: string): string {
  const url = new URL('/api/auth/linuxdo/start', apiBase || window.location.origin);
  url.searchParams.set('redirect', redirectPath);
  return url.toString();
}


export interface ApiEnvelope<T> {
  code: number;
  message: string;
  detail?: string;
  data: T;
}

export interface SessionUser {
  sub2api_user_id: number;
  linuxdo_subject: string;
  synthetic_email: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface CheckinStatus {
  checkin_enabled: boolean;
  timezone: string;
  checkin_date: string;
  daily_reward_balance: number;
  checked_in: boolean;
  grant_status: 'pending' | 'success' | 'failed' | null;
  checked_at: string | null;
  reward_balance: number | null;
}

export interface CheckinHistoryItem {
  id: number;
  checkin_date: string;
  reward_balance: number;
  grant_status: 'pending' | 'success' | 'failed';
  grant_error: string;
  created_at: string;
}

export interface AdminSettings {
  checkin_enabled: boolean;
  daily_reward_balance: number;
  timezone: string;
}

export interface DailyStatPoint {
  checkinDate: string;
  checkinUsers: number;
  grantTotal: number;
}

export interface DailyStats {
  days: number;
  active_users: number;
  total_checkins: number;
  total_grant_balance: number;
  points: DailyStatPoint[];
}

export interface WhitelistItem {
  id: number;
  linuxdoSubject: string;
  notes: string;
  createdAt: string;
}

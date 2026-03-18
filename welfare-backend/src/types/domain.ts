export interface SessionUser {
  sub2apiUserId: number;
  linuxdoSubject: string;
  syntheticEmail: string;
  username: string;
  avatarUrl: string | null;
}

export interface WelfareSettings {
  checkinEnabled: boolean;
  dailyRewardBalance: number;
  timezone: string;
}

export interface CheckinRecord {
  id: number;
  sub2apiUserId: number;
  linuxdoSubject: string;
  syntheticEmail: string;
  checkinDate: string;
  rewardBalance: number;
  idempotencyKey: string;
  grantStatus: 'pending' | 'success' | 'failed';
  grantError: string;
  sub2apiRequestId: string;
  createdAt: string;
  updatedAt: string;
}

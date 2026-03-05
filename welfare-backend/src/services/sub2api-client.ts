import { config } from '../config.js';
import { fetchWithTimeout, HttpError } from '../utils/http.js';

interface Sub2apiEnvelope<T> {
  code: number;
  message: string;
  reason?: string;
  data?: T;
}

interface AdminUserLite {
  id: number;
  email: string;
  username?: string;
  balance?: number;
}

interface AdminUsersPage {
  items: AdminUserLite[];
  total: number;
}

export class Sub2apiClient {
  private readonly baseHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': config.SUB2API_ADMIN_API_KEY
  } as const;

  async findUserBySyntheticEmail(email: string): Promise<AdminUserLite | null> {
    const query = new URLSearchParams({
      page: '1',
      page_size: '20',
      search: email
    });
    const response = await fetchWithTimeout(
      `${config.SUB2API_BASE_URL}/api/v1/admin/users?${query.toString()}`,
      {
        method: 'GET',
        headers: this.baseHeaders
      },
      config.SUB2API_TIMEOUT_MS
    );
    const body = await response.text();
    if (!response.ok) {
      throw new HttpError(response.status, body, `查询 sub2api 用户失败: ${response.status}`);
    }

    const envelope = JSON.parse(body) as Sub2apiEnvelope<AdminUsersPage>;
    if (envelope.code !== 0 || !envelope.data) {
      throw new Error(`sub2api 返回异常：${envelope.message || 'unknown error'}`);
    }

    const normalized = email.toLowerCase();
    const matched =
      envelope.data.items?.find((item) => item.email?.toLowerCase() === normalized) ??
      null;
    return matched;
  }

  async addUserBalance(input: {
    userId: number;
    amount: number;
    notes: string;
    idempotencyKey: string;
  }): Promise<{ newBalance?: number; requestId: string }> {
    const response = await fetchWithTimeout(
      `${config.SUB2API_BASE_URL}/api/v1/admin/users/${input.userId}/balance`,
      {
        method: 'POST',
        headers: {
          ...this.baseHeaders,
          'Idempotency-Key': input.idempotencyKey
        },
        body: JSON.stringify({
          balance: input.amount,
          operation: 'add',
          notes: input.notes
        })
      },
      config.SUB2API_TIMEOUT_MS
    );
    const body = await response.text();
    const requestId = response.headers.get('x-request-id') ?? '';
    if (!response.ok) {
      throw new HttpError(response.status, body, `sub2api 加余额失败: ${response.status}`);
    }

    const envelope = JSON.parse(body) as Sub2apiEnvelope<AdminUserLite>;
    if (envelope.code !== 0) {
      throw new Error(`sub2api 加余额失败：${envelope.message || 'unknown error'}`);
    }
    return {
      newBalance: envelope.data?.balance,
      requestId
    };
  }
}

export const sub2apiClient = new Sub2apiClient();


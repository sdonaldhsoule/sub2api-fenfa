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

const USER_PAGE_SIZE = 100;
const SUB2API_RETRY_DELAYS_MS = [0, 300];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableSub2apiError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    /fetch failed|network|timeout/i.test(error.message)
  );
}

export class Sub2apiClient {
  private readonly baseHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': config.SUB2API_ADMIN_API_KEY
  } as const;

  private parseEnvelope<T>(body: string, context: string): Sub2apiEnvelope<T> {
    try {
      return JSON.parse(body) as Sub2apiEnvelope<T>;
    } catch {
      throw new Error(`${context}：sub2api 返回了无法解析的响应`);
    }
  }

  private async withRetries<T>(
    context: string,
    task: () => Promise<T>
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await task();
      } catch (error) {
        if (
          !isRetriableSub2apiError(error) ||
          attempt >= SUB2API_RETRY_DELAYS_MS.length
        ) {
          throw error;
        }

        const delayMs = SUB2API_RETRY_DELAYS_MS[attempt] ?? 0;
        console.warn(
          `[sub2api] ${context} 第 ${attempt + 1} 次失败，${delayMs}ms 后重试`,
          error instanceof Error ? error.message : error
        );
        attempt += 1;
        await sleep(delayMs);
      }
    }
  }

  private async fetchUsersPage(
    email: string,
    page: number
  ): Promise<Sub2apiEnvelope<AdminUsersPage>> {
    return this.withRetries(`查询用户 ${email}`, async () => {
      const query = new URLSearchParams({
        page: String(page),
        page_size: String(USER_PAGE_SIZE),
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

      const envelope = this.parseEnvelope<AdminUsersPage>(body, '查询 sub2api 用户失败');
      if (envelope.code !== 0 || !envelope.data) {
        throw new Error(`查询 sub2api 用户失败：${envelope.message || 'unknown error'}`);
      }

      return envelope;
    });
  }

  async findUserBySyntheticEmail(email: string): Promise<AdminUserLite | null> {
    const normalized = email.toLowerCase();
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const envelope = await this.fetchUsersPage(email, page);
      const items = envelope.data?.items ?? [];
      const matched = items.find((item) => item.email?.toLowerCase() === normalized) ?? null;
      if (matched) {
        return matched;
      }

      const total = envelope.data?.total ?? items.length;
      totalPages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
      if (items.length === 0) {
        break;
      }
      page += 1;
    }

    return null;
  }

  async addUserBalance(input: {
    userId: number;
    amount: number;
    notes: string;
    idempotencyKey: string;
  }): Promise<{ newBalance?: number; requestId: string }> {
    return this.withRetries(`给用户 ${input.userId} 发放兑换额度`, async () => {
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

      const envelope = this.parseEnvelope<AdminUserLite>(body, 'sub2api 加余额失败');
      if (envelope.code !== 0) {
        throw new Error(`sub2api 加余额失败：${envelope.message || 'unknown error'}`);
      }

      return {
        newBalance: envelope.data?.balance,
        requestId
      };
    });
  }
}

export const sub2apiClient = new Sub2apiClient();

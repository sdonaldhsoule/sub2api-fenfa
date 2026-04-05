import { isIP } from 'node:net';
import { config } from '../config.js';

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const CLOUDFLARE_PAGE_SIZE = 100;

export type CloudflareIpAccessMode =
  | 'block'
  | 'challenge'
  | 'managed_challenge'
  | 'js_challenge'
  | 'whitelist';

export interface CloudflareIpAccessRule {
  id: string;
  mode: CloudflareIpAccessMode;
  target: 'ip' | 'ip6';
  value: string;
  notes: string;
  createdAt: string | null;
  modifiedAt: string | null;
}

interface CloudflareListResultInfo {
  page?: number;
  per_page?: number;
  total_pages?: number;
}

interface CloudflareApiEnvelope<T> {
  success: boolean;
  errors?: Array<{
    code?: number;
    message?: string;
  }>;
  result: T;
  result_info?: CloudflareListResultInfo;
}

interface CloudflareAccessRuleApiItem {
  id?: string;
  mode?: string;
  notes?: string;
  configuration?: {
    target?: string;
    value?: string;
  };
  created_on?: string | null;
  modified_on?: string | null;
}

export interface CloudflareClientLike {
  isConfigured(): boolean;
  getDisabledReason(): string;
  listIpAccessRules(ipAddress: string): Promise<CloudflareIpAccessRule[]>;
  createIpAccessRule(input: {
    ipAddress: string;
    mode: Extract<CloudflareIpAccessMode, 'managed_challenge' | 'block'>;
    notes: string;
  }): Promise<CloudflareIpAccessRule>;
  updateIpAccessRule(input: {
    ruleId: string;
    mode: Extract<CloudflareIpAccessMode, 'managed_challenge' | 'block'>;
    notes: string;
  }): Promise<CloudflareIpAccessRule>;
  deleteIpAccessRule(ruleId: string): Promise<void>;
}

export class CloudflareClientConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudflareClientConfigError';
  }
}

export class CloudflareClientConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudflareClientConflictError';
  }
}

export class CloudflareClientRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'CloudflareClientRequestError';
    this.status = status;
  }
}

function normalizeIpAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new CloudflareClientConflictError('IP 地址不能为空');
  }
  return normalized;
}

function resolveIpTarget(ipAddress: string): 'ip' | 'ip6' {
  const family = isIP(ipAddress);
  if (family === 4) {
    return 'ip';
  }
  if (family === 6) {
    return 'ip6';
  }
  throw new CloudflareClientConflictError('仅支持单个 IPv4 / IPv6 地址');
}

function normalizeRule(input: CloudflareAccessRuleApiItem): CloudflareIpAccessRule | null {
  const target = input.configuration?.target;
  const value = input.configuration?.value;
  if (
    !input.id ||
    !value ||
    (target !== 'ip' && target !== 'ip6') ||
    (input.mode !== 'block' &&
      input.mode !== 'challenge' &&
      input.mode !== 'managed_challenge' &&
      input.mode !== 'js_challenge' &&
      input.mode !== 'whitelist')
  ) {
    return null;
  }

  return {
    id: input.id,
    mode: input.mode,
    target,
    value: value.trim().toLowerCase(),
    notes: input.notes?.trim() ?? '',
    createdAt: input.created_on ?? null,
    modifiedAt: input.modified_on ?? null
  };
}

export class CloudflareClient implements CloudflareClientLike {
  isConfigured(): boolean {
    return config.CLOUDFLARE_IP_ACCESS_ENABLED;
  }

  getDisabledReason(): string {
    return config.CLOUDFLARE_IP_ACCESS_DISABLED_REASON;
  }

  async listIpAccessRules(ipAddress: string): Promise<CloudflareIpAccessRule[]> {
    this.assertConfigured();
    const normalizedIp = normalizeIpAddress(ipAddress);
    const target = resolveIpTarget(normalizedIp);

    const items: CloudflareIpAccessRule[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await this.request<CloudflareAccessRuleApiItem[]>(
        '',
        {
          method: 'GET'
        },
        {
          page: String(page),
          per_page: String(CLOUDFLARE_PAGE_SIZE)
        }
      );

      response.result
        .map((item) => normalizeRule(item))
        .filter((item): item is CloudflareIpAccessRule => item !== null)
        .filter((item) => item.target === target && item.value === normalizedIp)
        .forEach((item) => items.push(item));

      totalPages = Math.max(1, response.result_info?.total_pages ?? 1);
      page += 1;
    }

    return items;
  }

  async createIpAccessRule(input: {
    ipAddress: string;
    mode: Extract<CloudflareIpAccessMode, 'managed_challenge' | 'block'>;
    notes: string;
  }): Promise<CloudflareIpAccessRule> {
    this.assertConfigured();
    const normalizedIp = normalizeIpAddress(input.ipAddress);
    const response = await this.request<CloudflareAccessRuleApiItem>('', {
      method: 'POST',
      body: JSON.stringify({
        mode: input.mode,
        configuration: {
          target: resolveIpTarget(normalizedIp),
          value: normalizedIp
        },
        notes: input.notes
      })
    });
    const item = normalizeRule(response.result);
    if (!item) {
      throw new CloudflareClientRequestError('Cloudflare 返回了无法识别的规则数据');
    }
    return item;
  }

  async updateIpAccessRule(input: {
    ruleId: string;
    mode: Extract<CloudflareIpAccessMode, 'managed_challenge' | 'block'>;
    notes: string;
  }): Promise<CloudflareIpAccessRule> {
    this.assertConfigured();
    const response = await this.request<CloudflareAccessRuleApiItem>(`/${input.ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        mode: input.mode,
        notes: input.notes
      })
    });
    const item = normalizeRule(response.result);
    if (!item) {
      throw new CloudflareClientRequestError('Cloudflare 返回了无法识别的规则数据');
    }
    return item;
  }

  async deleteIpAccessRule(ruleId: string): Promise<void> {
    this.assertConfigured();
    await this.request<CloudflareAccessRuleApiItem | null>(`/${ruleId}`, {
      method: 'DELETE'
    });
  }

  private assertConfigured() {
    if (!this.isConfigured() || !config.CLOUDFLARE_API_TOKEN || !config.CLOUDFLARE_ZONE_ID) {
      throw new CloudflareClientConfigError(this.getDisabledReason());
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    query?: Record<string, string>
  ): Promise<CloudflareApiEnvelope<T>> {
    if (!config.CLOUDFLARE_ZONE_ID || !config.CLOUDFLARE_API_TOKEN) {
      throw new CloudflareClientConfigError(this.getDisabledReason());
    }

    const url = new URL(
      `${CLOUDFLARE_API_BASE_URL}/zones/${config.CLOUDFLARE_ZONE_ID}/firewall/access_rules/rules${path}`
    );

    Object.entries(query ?? {}).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
        ...init.headers
      },
      signal: AbortSignal.timeout(config.CLOUDFLARE_TIMEOUT_MS)
    });

    const rawBody = await response.text();
    let body: CloudflareApiEnvelope<T> | null = null;

    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as CloudflareApiEnvelope<T>;
      } catch {
        throw new CloudflareClientRequestError(
          rawBody || 'Cloudflare 返回了无法解析的响应',
          response.status
        );
      }
    }

    const errorMessage =
      body?.errors
        ?.map((item) => item.message?.trim())
        .filter((item): item is string => Boolean(item))
        .join('；') ||
      body?.errors
        ?.map((item) => String(item.code ?? '').trim())
        .filter(Boolean)
        .join('，') ||
      rawBody ||
      'Cloudflare API 请求失败';

    if (!response.ok || !body?.success) {
      throw new CloudflareClientRequestError(errorMessage, response.status);
    }

    return body;
  }
}

export const cloudflareClient = new CloudflareClient();

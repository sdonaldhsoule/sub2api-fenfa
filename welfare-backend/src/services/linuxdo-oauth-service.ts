import { config } from '../config.js';
import { fetchWithTimeout, parseOAuthBody, HttpError } from '../utils/http.js';
import { isSafeLinuxDoSubject } from '../utils/oauth.js';

export interface LinuxDoUserInfo {
  subject: string;
  username: string;
  avatarUrl: string | null;
}

export class LinuxDoOAuthService {
  async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    const form = new URLSearchParams();
    form.set('grant_type', 'authorization_code');
    form.set('client_id', config.LINUXDO_CLIENT_ID);
    form.set('client_secret', config.LINUXDO_CLIENT_SECRET);
    form.set('code', code);
    form.set('redirect_uri', config.LINUXDO_REDIRECT_URI);
    form.set('code_verifier', codeVerifier);

    const response = await fetchWithTimeout(
      config.LINUXDO_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      },
      config.SUB2API_TIMEOUT_MS
    );
    const body = await response.text();
    if (!response.ok) {
      throw new HttpError(response.status, body, `LinuxDo 换 token 失败: ${response.status}`);
    }
    const parsed = parseOAuthBody(body);
    const accessToken = String(parsed.access_token ?? '').trim();
    if (!accessToken) {
      throw new Error('LinuxDo 返回 access_token 为空');
    }
    return accessToken;
  }

  async fetchUserInfo(accessToken: string): Promise<LinuxDoUserInfo> {
    const response = await fetchWithTimeout(
      config.LINUXDO_USERINFO_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      },
      config.SUB2API_TIMEOUT_MS
    );
    const body = await response.text();
    if (!response.ok) {
      throw new HttpError(
        response.status,
        body,
        `LinuxDo 获取用户信息失败: ${response.status}`
      );
    }

    const payload = JSON.parse(body) as Record<string, unknown>;
    const subjectRaw = this.pickString(payload, [
      'sub',
      'id',
      'user_id',
      'uid',
      'user.id'
    ]);
    if (!subjectRaw || !isSafeLinuxDoSubject(subjectRaw)) {
      throw new Error('LinuxDo 返回 subject 非法');
    }

    const username =
      this.pickString(payload, [
        'username',
        'preferred_username',
        'name',
        'user.username',
        'user.name'
      ]) ?? `linuxdo_${subjectRaw}`;

    const avatarTemplate = this.pickString(payload, [
      'avatar_template',
      'avatar_url',
      'picture'
    ]);
    const avatarUrl = avatarTemplate
      ? this.buildAvatarUrl(avatarTemplate)
      : null;

    return {
      subject: subjectRaw,
      username,
      avatarUrl
    };
  }

  private pickString(
    source: Record<string, unknown>,
    paths: string[]
  ): string | null {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  }

  private buildAvatarUrl(template: string): string {
    const path = template.replace('{size}', '288');
    if (path.startsWith('http')) return path;
    return `https://linux.do${path}`;
  }

  private readPath(source: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = source;
    for (const key of keys) {
      if (typeof current !== 'object' || current == null) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }
}

export const linuxDoOAuthService = new LinuxDoOAuthService();


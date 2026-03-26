import { describe, expect, it } from 'vitest';
import { getRouterBasename, normalizeAppBase, resolveAppPath } from './app-base';

describe('app base helpers', () => {
  it('会把空值规范化为根路径', () => {
    expect(normalizeAppBase(undefined)).toBe('/');
    expect(normalizeAppBase('/')).toBe('/');
  });

  it('会保留子路径部署所需的 basename', () => {
    expect(normalizeAppBase('/welfare/')).toBe('/welfare');
    expect(getRouterBasename('/welfare/')).toBe('/welfare');
  });

  it('支持把前端内部路径解析到子路径下', () => {
    expect(resolveAppPath('/checkin', '/welfare/')).toBe('/welfare/checkin');
    expect(resolveAppPath('admin', '/welfare/')).toBe('/welfare/admin');
  });

  it('兼容带协议的 base 地址并仅提取 pathname', () => {
    expect(normalizeAppBase('https://example.com/welfare/')).toBe('/welfare');
    expect(resolveAppPath('/auth/callback', 'https://example.com/welfare/')).toBe(
      '/welfare/auth/callback'
    );
  });
});

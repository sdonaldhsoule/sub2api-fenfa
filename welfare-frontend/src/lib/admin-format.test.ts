import { describe, expect, it } from 'vitest';
import {
  formatAdminDate,
  formatAdminDateTime,
  formatAdminTime
} from './admin-format';

describe('admin format helpers', () => {
  it('纯日期字符串按本地日期展示而不发生跨时区偏移', () => {
    expect(formatAdminDate('2026-03-26')).toBe('2026-03-26');
  });

  it('ISO 时间字符串会格式化为日期时间与时分', () => {
    const value = '2026-03-26T08:09:00.000Z';
    expect(formatAdminDateTime(value)).toMatch(/^2026-03-\d{2} /);
    expect(formatAdminTime(value)).toMatch(/\d{2}:\d{2}/);
  });
});

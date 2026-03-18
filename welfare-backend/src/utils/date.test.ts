import { describe, expect, it } from 'vitest';
import { getBusinessDate, isValidTimezone, shiftDateString } from './date.js';

describe('date utils', () => {
  it('supports timezone validation', () => {
    expect(isValidTimezone('Asia/Shanghai')).toBe(true);
    expect(isValidTimezone('Invalid/Timezone')).toBe(false);
  });

  it('calculates business date in configured timezone', () => {
    const utc = new Date('2026-03-05T16:30:00.000Z');
    expect(getBusinessDate('Asia/Shanghai', utc)).toBe('2026-03-06');
    expect(getBusinessDate('UTC', utc)).toBe('2026-03-05');
  });

  it('shifts a date string in utc-safe mode', () => {
    expect(shiftDateString('2026-03-06', -1)).toBe('2026-03-05');
    expect(shiftDateString('2026-01-01', -1)).toBe('2025-12-31');
  });
});

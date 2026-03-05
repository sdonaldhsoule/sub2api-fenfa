import { describe, expect, it } from 'vitest';
import { getBusinessDate, isValidTimezone } from './date.js';

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
});


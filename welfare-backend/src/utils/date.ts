const cache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  if (!cache.has(timezone)) {
    cache.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    );
  }
  return cache.get(timezone)!;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    getFormatter(timezone);
    return true;
  } catch {
    return false;
  }
}

export function getBusinessDate(timezone: string, date = new Date()): string {
  return getFormatter(timezone).format(date);
}

export function shiftDateString(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`非法日期字符串: ${dateString}`);
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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


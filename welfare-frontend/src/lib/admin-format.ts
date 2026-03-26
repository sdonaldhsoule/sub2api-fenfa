const zhDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const zhTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const zhDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const zhBusinessDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short'
});

function parseDateLike(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) {
    return '未设置';
  }

  const parsed = parseDateLike(value);
  if (!parsed) {
    return value;
  }

  return zhDateFormatter.format(parsed).replace(/\//g, '-');
}

export function formatAdminTime(value: string | null | undefined): string {
  if (!value) {
    return '未设置';
  }

  const parsed = parseDateLike(value);
  if (!parsed) {
    return value;
  }

  return zhTimeFormatter.format(parsed);
}

export function formatAdminDateTime(value: string | null | undefined): string {
  if (!value) {
    return '未设置';
  }

  const parsed = parseDateLike(value);
  if (!parsed) {
    return value;
  }

  return zhDateTimeFormatter.format(parsed).replace(/\//g, '-');
}

export function formatAdminBusinessDate(value: string | null | undefined): string {
  if (!value) {
    return '未设置';
  }

  const parsed = parseDateLike(value);
  if (!parsed) {
    return value;
  }

  return zhBusinessDateFormatter.format(parsed).replace(/\//g, '-');
}

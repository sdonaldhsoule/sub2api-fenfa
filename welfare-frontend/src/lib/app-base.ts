function extractPathname(value: string): string {
  if (!value || value === '/') {
    return '/';
  }

  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname || '/';
    }
  } catch {
    return value;
  }

  return value;
}

export function normalizeAppBase(base: string | undefined): string {
  const pathname = extractPathname((base ?? '/').trim());
  const normalized = pathname.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');

  return normalized ? `/${normalized}` : '/';
}

export function getRouterBasename(base: string | undefined = import.meta.env.BASE_URL):
  | string
  | undefined {
  const normalized = normalizeAppBase(base);
  return normalized === '/' ? undefined : normalized;
}

export function resolveAppPath(
  path: string,
  base: string | undefined = import.meta.env.BASE_URL
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const basename = normalizeAppBase(base);

  if (basename === '/') {
    return normalizedPath;
  }

  return `${basename}${normalizedPath}`;
}

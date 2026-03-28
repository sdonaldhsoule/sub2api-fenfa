export const SUB2API_BRIDGE_STORAGE_KEY = 'welfare.sub2api_bridge';

export interface Sub2apiBridgeParams {
  token?: string;
  userId?: number;
  redirect?: string;
}

interface StringStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): StringStorageLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseParams(search: string): Sub2apiBridgeParams {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const token = params.get('token')?.trim() || undefined;
  const userIdRaw = params.get('user_id')?.trim();
  const redirect = params.get('redirect')?.trim() || undefined;
  const userId =
    userIdRaw && /^\d+$/.test(userIdRaw)
      ? Number(userIdRaw)
      : undefined;

  return {
    token,
    userId,
    redirect
  };
}

function hasPayload(params: Sub2apiBridgeParams): boolean {
  return Boolean(params.token || params.userId || params.redirect);
}

function writeStoredParams(params: Sub2apiBridgeParams): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SUB2API_BRIDGE_STORAGE_KEY, JSON.stringify(params));
}

function readStoredParams(): Sub2apiBridgeParams {
  const storage = getStorage();
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(SUB2API_BRIDGE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Sub2apiBridgeParams : {};
  } catch {
    return {};
  }
}

export function clearSub2apiBridgeParams(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(SUB2API_BRIDGE_STORAGE_KEY);
}

export function captureSub2apiBridgeParams(search: string): {
  params: Sub2apiBridgeParams;
  shouldClearUrl: boolean;
} {
  const current = parseParams(search);
  if (hasPayload(current)) {
    writeStoredParams(current);
    return {
      params: current,
      shouldClearUrl: true
    };
  }

  return {
    params: readStoredParams(),
    shouldClearUrl: false
  };
}

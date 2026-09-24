interface Entry<T> { value: T; exp: number; }

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.exp <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, exp: Date.now() + ttlMs });
}

export function cacheDel(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

const MEMBERSHIP_TTL = 15_000;
const CONFIG_TTL = 30_000;

export const membershipCacheKey = (userId: string, workspaceId: string) => `role:${userId}:${workspaceId}`;
export const CONFIG_CACHE_KEY = 'system-config';
export { MEMBERSHIP_TTL, CONFIG_TTL };

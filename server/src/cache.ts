import { getRedis } from './redis';

const TTL_MS = 30_000;
const CHANNEL = 'reqspace:cache';

type Entry = { value: unknown; expires: number };

const entries = new Map<string, Entry>();

function drop(prefix: string) {
  for (const key of [...entries.keys()]) {
    if (key === prefix || key.startsWith(prefix)) entries.delete(key);
  }
}

export async function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  entries.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function peek<T>(key: string): T | undefined {
  const hit = entries.get(key);
  if (!hit || hit.expires <= Date.now()) return undefined;
  return hit.value as T;
}

export function store<T>(key: string, value: T) {
  entries.set(key, { value, expires: Date.now() + TTL_MS });
}

/** Drop this process's copy and tell other replicas to drop theirs. */
export function invalidate(prefix: string) {
  drop(prefix);
  getRedis()?.publish(CHANNEL, prefix).catch(() => undefined);
}

export async function subscribeCacheInvalidation() {
  const redis = getRedis();
  if (!redis) return;
  const sub = redis.duplicate();
  await sub.subscribe(CHANNEL);
  sub.on('message', (_channel: string, prefix: string) => drop(prefix));
}

export function cacheSize(): number {
  return entries.size;
}

let active = false;

export function getRedisStatus(): 'active' | 'inactive' {
  return active ? 'active' : 'inactive';
}

export function markRedisActive(value: boolean): void {
  active = value;
}

let client: { incr: (key: string) => Promise<number>; expire: (key: string, seconds: number) => Promise<unknown>; pttl: (key: string) => Promise<number> } | null = null;

export function setRedisRateClient(c: typeof client): void {
  client = c;
}

export async function sharedIncr(key: string, windowMs: number): Promise<{ count: number; ttlMs: number } | null> {
  if (!client) return null;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, Math.ceil(windowMs / 1000));
  const ttl = await client.pttl(key);
  return { count, ttlMs: ttl > 0 ? ttl : windowMs };
}

export async function attachSocketRedis(io: { adapter: (adapter: unknown) => void }): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('ℹ️  REDIS_URL not set — single-node socket mode');
    return;
  }
  const { createClient } = await import('redis');
  const { createAdapter } = await import('@socket.io/redis-adapter');
  const pub = createClient({ url });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
  setRedisRateClient(pub as any);
  markRedisActive(true);
  console.log('✅ Redis concurrency mode active');
}

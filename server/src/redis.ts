import type { Server as SocketIOServer } from 'socket.io';
import type { Redis } from 'ioredis';

export type RedisMode = 'active' | 'inactive';

let pub: Redis | null = null;
let mode: RedisMode = 'inactive';

export function getRedis(): Redis | null {
  return mode === 'active' ? pub : null;
}

export function redisMode(): RedisMode {
  return mode;
}

/** Connect when REDIS_URL is set. A failure leaves the process in single-node mode. */
export async function connectRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    mode = 'inactive';
    return;
  }
  const { default: RedisClient } = await import('ioredis');
  const client = new RedisClient(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
  try {
    await client.ping();
    pub = client;
    mode = 'active';
    console.log('Redis concurrency mode: active');
  } catch (err) {
    mode = 'inactive';
    client.disconnect();
    console.error('REDIS_URL is set but Redis did not answer. Staying single-node.', err);
  }
}

export async function attachSocketAdapter(io: SocketIOServer): Promise<void> {
  if (!pub || mode !== 'active') return;
  const { createAdapter } = await import('@socket.io/redis-adapter');
  const sub = pub.duplicate();
  await sub.ping();
  io.adapter(createAdapter(pub, sub));
}

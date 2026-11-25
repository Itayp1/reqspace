import type { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis, type RedisOptions } from 'ioredis';
import { IRedisSettings, SystemConfigRepository } from '../repositories/SystemConfigRepository';

const CONNECT_TIMEOUT_MS = 3000;

function toOptions(cfg: IRedisSettings): RedisOptions {
  return {
    host: cfg.host,
    port: cfg.port,
    username: cfg.username || undefined,
    password: cfg.password || undefined,
    db: cfg.db || 0,
    tls: cfg.tls ? {} : undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
  };
}

/** Connects, PINGs and disconnects. Resolves with the reason on failure, null on success; never throws. */
export async function testRedis(cfg: IRedisSettings): Promise<string | null> {
  const client = new Redis({ ...toOptions(cfg), lazyConnect: true, retryStrategy: () => null, maxRetriesPerRequest: 0 });
  client.on('error', () => { /* surfaced through the rejected connect()/ping() below */ });
  try {
    await client.connect();
    await client.ping();
    return null;
  } catch (e: any) {
    return e?.message || 'unknown error';
  } finally {
    client.disconnect();
  }
}

/**
 * Attaches the Redis adapter so emits reach sockets on every pod. Called once at boot:
 * the REDIS_URL env var wins, else the admin's saved settings. A failed check is logged
 * and the server keeps Socket.IO's in-memory adapter, so a bad Redis never blocks startup.
 */
export async function attachRedisAdapter(io: Server): Promise<void> {
  const cfg = (await SystemConfigRepository.getConfig())?.server.redis;
  const url = process.env.REDIS_URL;
  if (!url && !(cfg?.enabled && cfg.host)) return;

  const failure = url ? await testRedis(urlToSettings(url)) : await testRedis(cfg!);
  if (failure) {
    console.warn(`⚠️  Redis unavailable (${failure}); realtime events stay on this pod only.`);
    return;
  }
  const pub = url ? new Redis(url) : new Redis(toOptions(cfg!));
  const sub = pub.duplicate();
  for (const c of [pub, sub]) c.on('error', (e) => console.warn('Redis error:', e.message));
  // If Redis drops later, ioredis reconnects by itself. Local delivery is unaffected (the adapter
  // emits locally first); a publish that fails must not become an unhandled rejection.
  const publish = pub.publish.bind(pub) as (...a: any[]) => Promise<number>;
  (pub as any).publish = (...a: any[]) => publish(...a).catch((e: Error) => { console.warn('Redis publish failed:', e.message); return 0; });
  io.adapter(createAdapter(pub, sub));
  console.log('✅ Socket.IO Redis adapter active');
}

function urlToSettings(url: string): IRedisSettings {
  const u = new URL(url);
  return {
    enabled: true,
    host: u.hostname,
    port: Number(u.port) || 6379,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    tls: u.protocol === 'rediss:',
    db: Number(u.pathname.slice(1)) || 0,
  };
}

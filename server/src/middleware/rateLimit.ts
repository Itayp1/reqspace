import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../redis';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface LimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export function memoryStore(): LimitStore {
  const buckets = new Map<string, Bucket>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  timer.unref();
  return {
    async hit(key, windowMs) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return { count: bucket.count, resetAt: bucket.resetAt };
    },
  };
}

/** Fixed window shared by every process that uses the same Redis. */
export function redisStore(redis: { incr: (key: string) => Promise<number>; pttl: (key: string) => Promise<number>; pexpire: (key: string, ms: number) => Promise<number> }): LimitStore {
  return {
    async hit(key, windowMs) {
      const count = await redis.incr(key);
      let ttl = await redis.pttl(key);
      if (count === 1 || ttl < 0) {
        await redis.pexpire(key, windowMs);
        ttl = windowMs;
      }
      return { count, resetAt: Date.now() + ttl };
    },
  };
}

/**
 * Fixed-window limiter. Uses Redis when concurrency mode is active so the
 * same cap holds on every replica. Otherwise the window stays in this process.
 */
export function rateLimit(options: { name: string; windowMs: number; max: number; message?: string }) {
  const local = memoryStore();

  return async (req: Request, res: Response, next: NextFunction) => {
    const redis = getRedis();
    const store = redis ? redisStore(redis) : local;
    const key = `rl:${options.name}:${req.ip ?? 'unknown'}`;
    const { count, resetAt } = await store.hit(key, options.windowMs);
    if (count > options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
      return res.status(429).json({ message: options.message ?? 'Too many requests — please try again later.' });
    }
    next();
  };
}

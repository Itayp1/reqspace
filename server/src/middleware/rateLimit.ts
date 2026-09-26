import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter for a handful of sensitive
 * routes (login/register/OAuth exchange) that previously had no throttling
 * at all — an internet-facing login form with unlimited attempts is a
 * password-brute-force oracle. Per-process only (not shared across
 * instances); fine for a single server, a horizontally-scaled deployment
 * should move this to Redis instead.
 */
export function rateLimit(options: { windowMs: number; max: number; message?: string; keyBy?: (req: Request) => string }) {
  // Local PM2 (ecosystem.config.js) sets this. Production and Docker do not,
  // so login/register/share throttling stays on outside that process.
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const buckets = new Map<string, Bucket>();

  let redisClient: any = null;
  if (process.env.REDIS_URL) {
    const { Redis } = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL);
  }

  if (!redisClient) {
    // Opportunistic cleanup so the map doesn't grow unboundedly across many
    // distinct IPs over a long-running process.
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }, options.windowMs).unref();
    void sweep;
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = options.keyBy ? options.keyBy(req) : (req.ip ?? 'unknown');
    const now = Date.now();
    
    if (redisClient) {
      const redisKey = `ratelimit:${key}`;
      try {
        const count = await redisClient.incr(redisKey);
        if (count === 1) {
          await redisClient.pexpire(redisKey, options.windowMs);
        }
        if (count > options.max) {
          const ttl = await redisClient.pttl(redisKey);
          res.setHeader('Retry-After', String(Math.ceil(ttl / 1000)));
          return res.status(429).json({ message: options.message ?? 'Too many requests — please try again later.' });
        }
        return next();
      } catch (e) {
        // Fallback to in-memory if Redis fails? Or just pass through.
        console.error('Redis rate limit error', e);
        return next();
      }
    }

    // In-memory fallback
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message: options.message ?? 'Too many requests — please try again later.' });
    }
    next();
  };
}

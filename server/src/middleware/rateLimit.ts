import { Request, Response, NextFunction } from 'express';
import { recordHandledError } from '../utils/errorReporter';
import { getServerSettings } from '../repositories/SystemConfigRepository';

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
export function rateLimit(options: { windowMs: number; max: number | (() => number); message?: string; keyBy?: (req: Request) => string }) {
  const maxOf = () => (typeof options.max === 'function' ? options.max() : options.max);
  const buckets = new Map<string, Bucket>();
  // Each limiter needs its own Redis namespace; with a shared `ratelimit:<ip>`
  // key every limiter counted every other limiter's hits.
  const limiterId = `${options.windowMs}:${(options.message ?? '').slice(0, 24)}`;

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
    // Admin > Settings > Server turns throttling off (e.g. local PM2, test runs).
    if (!getServerSettings().rateLimit.enabled) return next();
    const max = maxOf();
    const key = options.keyBy ? options.keyBy(req) : (req.ip ?? 'unknown');
    const now = Date.now();
    
    if (redisClient) {
      const redisKey = `ratelimit:${limiterId}:${key}`;
      try {
        const count = await redisClient.incr(redisKey);
        if (count === 1) {
          await redisClient.pexpire(redisKey, options.windowMs);
        }
        if (count > max) {
          const ttl = await redisClient.pttl(redisKey);
          res.setHeader('Retry-After', String(Math.ceil(ttl / 1000)));
          return res.status(429).json({ message: options.message ?? 'Too many requests — please try again later.' });
        }
        return next();
      } catch (e) {
        // Fallback to in-memory if Redis fails? Or just pass through.
        console.error('Redis rate limit error', e);
        recordHandledError('rate-limit', e);
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
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message: options.message ?? 'Too many requests — please try again later.' });
    }
    next();
  };
}

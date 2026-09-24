import { Request, Response, NextFunction } from 'express';
import { sharedIncr } from '../redis';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter. Uses Redis when REDIS_URL attached an adapter
 * (shared across replicas) and falls back to an in-process map otherwise.
 */
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs).unref();
  void sweep;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    sharedIncr(`rl:${options.windowMs}:${ip}`, options.windowMs).then((shared) => {
      if (res.headersSent) return;
      if (shared) {
        if (shared.count > options.max) {
          res.setHeader('Retry-After', String(Math.ceil(shared.ttlMs / 1000)));
          return res.status(429).json({ message: options.message ?? 'Too many requests — please try again later.' });
        }
        return next();
      }
      let bucket = buckets.get(ip);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + options.windowMs };
        buckets.set(ip, bucket);
      }
      bucket.count++;
      if (bucket.count > options.max) {
        res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
        return res.status(429).json({ message: options.message ?? 'Too many requests — please try again later.' });
      }
      next();
    }).catch(() => next());
  };
}

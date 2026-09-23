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
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>();

  // Opportunistic cleanup so the map doesn't grow unboundedly across many
  // distinct IPs over a long-running process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs).unref();
  void sweep;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
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

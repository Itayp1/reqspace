import { Request, Response, NextFunction } from 'express';
import { getJwtSecret } from '../utils/secrets';

// Requests that still work while JWT_SECRET is missing: health, the login page's
// secrets status, and the public config it reads.
const OPEN_WITHOUT_SECRET = new Set([
  '/api/health',
  '/api/bootstrap/status',
  '/api/auth/config',
]);

/** Blocks the API until a JWT secret exists: no login or session can be signed without one. */
export function secretsGate(req: Request, res: Response, next: NextFunction) {
  if (getJwtSecret() || OPEN_WITHOUT_SECRET.has(req.originalUrl.split('?')[0])) return next();
  res.status(503).json({
    message: 'JWT_SECRET is not configured. Open the app to generate one, then add it to the server environment.',
    code: 'SECRET_MISSING',
    missing: ['JWT_SECRET'],
  });
}

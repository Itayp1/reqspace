import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { Workspace } from '../models/Workspace';
import mongoose from 'mongoose';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { resolveJwtSecret } from '../utils/jwtSecret';

const JWT_SECRET = resolveJwtSecret();

export interface AuthRequest extends Request {
  user?: any;
}

export function signToken(userId: string, ttlDays: number): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, {
    expiresIn: `${ttlDays}d`,
  });
}

// Defaults to secure cookies in production (session token never sent over
// plain HTTP — required once this is a public, multi-tenant SaaS). Explicit
// COOKIE_SECURE=false opts back out for self-hosted deployments that are
// intentionally HTTP-only on a trusted network (e.g. behind Tailscale).
function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE !== undefined) return process.env.COOKIE_SECURE === 'true';
  return process.env.NODE_ENV === 'production';
}

// The attributes that identify the auth cookie. `clearCookie` only removes a
// cookie when these match what was used to set it — a mismatch on secure /
// sameSite / path leaves the session cookie in place (CR#16), so both helpers
// derive their options from here.
function authCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function setCookieToken(res: Response, token: string, ttlDays: number) {
  res.cookie('token', token, {
    ...authCookieOptions(),
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  });
}

/** Clears the auth cookie using the exact attributes it was set with. */
export function clearAuthCookie(res: Response) {
  res.clearCookie('token', authCookieOptions());
}

/** Creates personal workspace for a new user */
export async function createPersonalWorkspace(user: any) {
  const workspace = await WorkspaceRepository.create({
    name: `${user.name}'s Workspace`,
    description: 'Personal workspace',
    ownerId: user.id || user._id,
  });
  const { EnvironmentRepository } = await import('../repositories/EnvironmentRepository');
  await EnvironmentRepository.upsertGlobal(workspace.id || (workspace as any)._id, []);
}

/** Main auth middleware – validates JWT from cookie and optionally handles header auth */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const config = await SystemConfigRepository.getConfig();
    const mode = config?.auth.mode ?? 'login';
    const ttlDays = config?.auth.jwtTtlDays ?? 7;
    const refreshHours = config?.auth.jwtRefreshHoursBeforeExpiry ?? 24;

    // ── Header-based auto-provisioning ──────────────────────────────────────
    if (mode === 'header' || mode === 'both') {
      const headerName = config?.auth.headerName ?? 'X-Auth-User';
      const headerValue = req.headers[headerName.toLowerCase()] as string | undefined;

      if (headerValue) {
        let user = await User.findOne({ email: headerValue.toLowerCase() });

        if (!user) {
          // Auto-provision
          user = await User.create({
            name: headerValue,
            email: headerValue.toLowerCase(),
            passwordHash: null,
            authType: 'header',
          });
          await createPersonalWorkspace(user);
        }

        if (user.status !== 'active') {
          return res.status(403).json({ message: 'Account suspended' });
        }

        await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });
        const token = signToken(String(user._id), ttlDays);
        setCookieToken(res, token, ttlDays);
        req.user = user;
        return next();
      }

      if (mode === 'header') {
        return res.status(401).json({ message: 'Missing auth header' });
      }
    }

    // ── JWT Cookie validation ───────────────────────────────────────────────
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Session expired' });
    }

    const user = await UserRepository.findById(String(payload.sub));
    if (!user || user.status !== 'active') {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'User not found or suspended' });
    }

    // Auto-refresh: if token expires within refreshHours, issue new token
    const exp = payload.exp!;
    const now = Math.floor(Date.now() / 1000);
    const refreshThreshold = refreshHours * 3600;
    if (exp - now < refreshThreshold) {
      const newToken = signToken(String(user._id), ttlDays);
      setCookieToken(res, newToken, ttlDays);
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Require SuperAdmin */
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
}

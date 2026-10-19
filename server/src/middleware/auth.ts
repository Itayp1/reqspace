import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRepository, IUserRecord } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { resolveJwtSecret } from '../utils/jwtSecret';

const JWT_SECRET = resolveJwtSecret();

export type AuthUser = IUserRecord;

export interface AuthRequest extends Request {
  user?: AuthUser;
  // Route params are always single strings for our routes. The installed
  // express types widen these to `string | string[]`; narrow them here so the
  // (strictly-typed) repositories can be called with `req.params.x` directly.
  params: Record<string, string>;
}

export function signToken(userId: string, ttlDays: number, tokenVersion = 0): string {
  return jwt.sign({ sub: userId, tokenVersion }, JWT_SECRET, {
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

/**
 * Offline / single-user mode (REQSPACE_OFFLINE=true, set by the desktop app's
 * "skip sign-in" option): no login and no internet needed. Only honoured for
 * connections from this machine — the real socket peer, not X-Forwarded-For.
 */
export function isOfflineMode(): boolean {
  return process.env.REQSPACE_OFFLINE === 'true';
}

function isLoopbackPeer(req: Request): boolean {
  const ip = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}

const OFFLINE_EMAIL = 'local@reqspace.local';

async function getOrCreateOfflineUser() {
  let user = await UserRepository.findByEmail(OFFLINE_EMAIL);
  if (!user) {
    user = await UserRepository.create({
      name: 'Local User',
      email: OFFLINE_EMAIL,
      passwordHash: null,
      authType: 'local',
      isSuperAdmin: true,
    });
    await createPersonalWorkspace(user);
  }
  return user;
}

/** Creates personal workspace for a new user */
export async function createPersonalWorkspace(user: any) {
  const workspace = await WorkspaceRepository.create({
    name: `${user.name}'s Workspace`,
    description: 'Personal workspace',
    ownerId: user.id || user._id,
    isPersonal: true,
  });
  const { EnvironmentRepository } = await import('../repositories/EnvironmentRepository');
  await EnvironmentRepository.upsertGlobal(workspace.id || (workspace as any)._id, []);
}

// While a forced password change is pending, only the endpoints the change
// flow itself needs are usable; everything else is blocked server-side so the
// client modal cannot be bypassed with direct API calls (A5.6).
const MUST_CHANGE_PASSWORD_ALLOWED = ['/api/auth/me', '/api/auth/change-password', '/api/auth/logout', '/api/auth/config'];
function isAllowedWhileMustChangePassword(req: Request): boolean {
  const path = (req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
  return MUST_CHANGE_PASSWORD_ALLOWED.includes(path);
}

/** Main auth middleware – validates the JWT session cookie (or auto-signs-in the local user in offline mode) */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Several routers mounted under /api each start with `router.use(authenticate)`, so one request can
    // pass through this middleware repeatedly. Once it has been authenticated, don't hit the DB again.
    if (req.user) return next();

    const config = await SystemConfigRepository.getConfig();
    const ttlDays = config?.auth.jwtTtlDays ?? 7;
    const refreshHours = config?.auth.jwtRefreshHoursBeforeExpiry ?? 24;

    // ── Offline mode: sign in the local user automatically ─────────────────
    if (isOfflineMode()) {
      if (!isLoopbackPeer(req)) {
        return res.status(403).json({ message: 'Offline mode is only available from this machine' });
      }
      const user = await getOrCreateOfflineUser();
      if (user.status !== 'active') return res.status(403).json({ message: 'Account suspended' });
      setCookieToken(res, signToken(String(user._id), ttlDays, user.tokenVersion ?? 0), ttlDays);
      req.user = user;
      return next();
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

    // Token-version check: logout and password-change bump the DB counter,
    // so tokens minted before that event are immediately rejected (A4.2/A5.8).
    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Session invalidated' });
    }

    // Auto-refresh: if token expires within refreshHours, issue new token
    const exp = payload.exp!;
    const now = Math.floor(Date.now() / 1000);
    const refreshThreshold = refreshHours * 3600;
    if (exp - now < refreshThreshold) {
      const newToken = signToken(String(user._id), ttlDays, user.tokenVersion);
      setCookieToken(res, newToken, ttlDays);
    }

    if (user.mustChangePassword && !isAllowedWhileMustChangePassword(req)) {
      return res.status(403).json({ message: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
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

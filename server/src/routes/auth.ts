import { validate } from '../middleware/validate';
import * as schemas from '../schemas/auth.schemas';

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { authenticate, AuthRequest, signToken, setCookieToken, clearAuthCookie, createPersonalWorkspace, isOfflineMode } from '../middleware/auth';
import { logAudit } from '../repositories/AuditLogRepository';
import { rateLimit } from '../middleware/rateLimit';
import { noteRouteError } from '../utils/errorReporter';
import { fetchIdentity, isOAuthProvider, configKey, OAuthProviderId, OAUTH_PROVIDERS } from '../utils/oauthProviders';

const router = Router();

// Login/password-guessing and account-creation throttles — this whole file
// was previously reachable with unlimited attempts per IP.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: process.env.NODE_ENV === 'test' ? 1000 : 15, message: 'Too many login attempts — please try again later.' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: process.env.NODE_ENV === 'test' ? 1000 : 10, message: 'Too many accounts created from this address — please try again later.' });

// ── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', validate(schemas.registerSchema), registerLimiter, async (req: Request, res: Response) => {
  const config = await SystemConfigRepository.ensure();

  if (!config?.auth?.allowSelfRegistration) {
    return res.status(403).json({ message: 'Self-registration is disabled' });
  }

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  // Domain whitelist check
  const domains = config.auth.allowedEmailDomains;
  if (domains.length > 0) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !domains.includes('@' + domain)) {
      return res.status(403).json({ message: 'Email domain not allowed' });
    }
  }

  const existing = await UserRepository.findByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await UserRepository.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      authType: 'password', isSuperAdmin: false,
    });
  } catch (err: any) {
    // Concurrent registration with the same email loses the check-then-insert
    // race on the unique index — report it as a duplicate, not a 500 (A2.7).
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    throw err;
  }

  // Auto-create personal workspace
  await createPersonalWorkspace(user);

  await logAudit(user._id as any, 'user.register', {
    ip: req.ip,
    details: { email },
  });

  const token = signToken(String(user._id), config.auth.jwtTtlDays, 0);
  setCookieToken(res, token, config.auth.jwtTtlDays);

  return res.status(201).json({
    message: 'Registered successfully',
    // Session lives in the httpOnly cookie set above — the client never
    // reads a token field (grepped: unused), so it isn't echoed here too.
    user: { id: user._id, name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin },
  });
});

// R5.5: per-account throttle on FAILED logins, independent of the client IP, so
// rotating source addresses (spoofed X-Forwarded-For, botnets) can't brute-force one account.
const FAILED_LOGIN_MAX = 20;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map<string, { count: number; resetAt: number }>();
function loginKey(email: unknown) { return String(email ?? '').trim().toLowerCase(); }
function loginBlocked(key: string) {
  const f = failedLogins.get(key);
  if (f && f.resetAt <= Date.now()) { failedLogins.delete(key); return false; }
  return !!f && f.count >= FAILED_LOGIN_MAX;
}
function noteLoginFailure(key: string) {
  const now = Date.now();
  const f = failedLogins.get(key);
  if (!f || f.resetAt <= now) failedLogins.set(key, { count: 1, resetAt: now + FAILED_LOGIN_WINDOW_MS });
  else f.count++;
  if (failedLogins.size > 10000) for (const [k, v] of failedLogins) if (v.resetAt <= now) failedLogins.delete(k);
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', validate(schemas.loginSchema), loginLimiter, async (req: Request, res: Response) => {
  const config = await SystemConfigRepository.getConfig();

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const lk = loginKey(email);
  if (loginBlocked(lk)) {
    return res.status(429).json({ message: 'Too many login attempts — please try again later.' });
  }

  const user = await UserRepository.findByEmail(email);
  if (!user || !user.passwordHash) {
    noteLoginFailure(lk);
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.status !== 'active') {
    await logAudit(user._id as any, 'auth.login_failed', { ip: req.ip, details: { reason: 'suspended' } });
    return res.status(403).json({ message: 'Account suspended' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    noteLoginFailure(lk);
    await logAudit(user._id as any, 'auth.login_failed', { ip: req.ip, details: { reason: 'bad_password' } });
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  failedLogins.delete(lk);

  await UserRepository.update(user._id as any, { lastLoginAt: new Date() } as any);
  await logAudit(user._id as any, 'auth.login', { ip: req.ip });

  const ttlDays = config?.auth.jwtTtlDays ?? 7;
  const token = signToken(String(user._id), ttlDays, user.tokenVersion ?? 0);
  setCookieToken(res, token, ttlDays);

  return res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      mustChangePassword: user.mustChangePassword,
      avatar: user.avatar,
    },
  });
});

// ── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', validate(require('zod').z.any()), authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  // Bump tokenVersion so any previously issued JWT is rejected on next use
  // (A4.2 — stolen tokens stop working immediately after logout).
  await UserRepository.update(String(user._id), { tokenVersion: (user.tokenVersion ?? 0) + 1 } as any);
  clearAuthCookie(res);
  return res.json({ message: 'Logged out' });
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  
  const safeCerts = (user.clientCertificates || []).map((c: any) => ({
    _id: c._id,
    hostname: c.hostname,
    createdAt: c.createdAt
  }));
  
  return res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    mustChangePassword: user.mustChangePassword,
    avatar: user.avatar,
    settings: user.settings,
    clientCertificates: safeCerts,
    authType: user.authType,
  });
});

// ── GET /api/auth/config ─────────────────────────────────────────────────────
// Public endpoint – client needs to know what auth mode to show
router.get('/config', async (_req: Request, res: Response) => {
  const config = await SystemConfigRepository.getConfig();
  const out: Record<string, unknown> = {
    mode: isOfflineMode() ? 'offline' : 'login',
    allowSelfRegistration: config?.auth?.allowSelfRegistration ?? false,
  };
  // Public: only what the browser needs to start the redirect — never the secret.
  for (const id of OAUTH_PROVIDERS) {
    const c = config?.auth[configKey(id)];
    out[configKey(id)] = {
      enabled: c?.enabled ?? false,
      clientId: c?.clientId ?? '',
      ...(id === 'microsoft' ? { tenantId: c?.tenantId || 'common' } : {}),
      ...(id === 'custom' ? { name: c?.name || 'SSO', authorizeUrl: c?.authorizeUrl || '', scope: c?.scope || 'openid email profile' } : {}),
    };
  }
  return res.json(out);
});

// ── POST /api/auth/change-password ──────────────────────────────────────────
router.post('/change-password', validate(schemas.changePasswordSchema), authenticate, async (req: AuthRequest, res: Response) => {
  const { newPassword, currentPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }
  const user = req.user!;

  // A normal password change must prove knowledge of the current password
  // (CR#15b). The forced first-login change (mustChangePassword) is exempt —
  // the user just authenticated with the current password to get here.
  if (!user.mustChangePassword) {
    if (!currentPassword || !user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
  }

  // The new password must differ from the current one (A5.2).
  if (user.passwordHash && (await bcrypt.compare(newPassword, user.passwordHash))) {
    return res.status(400).json({ message: 'New password must be different from the current password' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const newTokenVersion = (user.tokenVersion ?? 0) + 1;
  await UserRepository.update(user._id as any, {
    passwordHash,
    mustChangePassword: false,
    // Bump tokenVersion to invalidate all sessions issued before this change
    // (A5.8 — password change revokes other active sessions).
    tokenVersion: newTokenVersion,
  } as any);
  // Keep the session that made the change alive with a token for the new version.
  const cfg = await SystemConfigRepository.getConfig();
  const ttlDays = cfg?.auth.jwtTtlDays ?? 7;
  setCookieToken(res, signToken(String(user._id), ttlDays, newTokenVersion), ttlDays);
  await logAudit(user._id as any, 'auth.change_password', { details: { forced: !!user.mustChangePassword } });
  return res.json({ message: 'Password changed successfully' });
});

// ── GET /api/auth/state ────────────────────────────────────────────────────────
router.get('/state', async (req: Request, res: Response) => {
  const crypto = await import('crypto');
  const state = crypto.randomBytes(32).toString('hex');
  // One cookie per attempt (named by the state's prefix) so a second click or tab can't invalidate the first.
  res.set('Cache-Control', 'no-store');
  res.cookie(`oauth_state_${state.slice(0, 16)}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });
  return res.json({ state });
});

// ── POST /api/auth/:provider (google | github | microsoft) ──────────────────
const oauthLogin = (provider: OAuthProviderId) => async (req: Request, res: Response) => {
  const label = provider === 'custom' ? 'SSO' : provider[0].toUpperCase() + provider.slice(1);
  const { code, redirectUri, state } = req.body;
  if (!code) return res.status(400).json({ message: 'Code is required' });

  const crypto = await import('crypto');
  const cookieName = typeof state === 'string' && /^[0-9a-f]{64}$/.test(state) ? `oauth_state_${state.slice(0, 16)}` : '';
  const cookieState = cookieName ? req.cookies?.[cookieName] : undefined;
  if (cookieName) res.clearCookie(cookieName, { path: '/' }); // clear immediately

  const ok = typeof state === 'string' && typeof cookieState === 'string' &&
    state.length === 64 && cookieState.length === 64 &&
    crypto.timingSafeEqual(Buffer.from(state, 'hex'), Buffer.from(cookieState, 'hex'));
    
  if (!ok) {
    return res.status(403).json({ message: 'Invalid or expired OAuth state' });
  }

  const config = await SystemConfigRepository.getConfig();
  const oauthConfig = config?.auth[configKey(provider)];
  if (!oauthConfig?.enabled) return res.status(403).json({ message: `${label} sign-in is disabled` });

  // Hard-allowlist redirect URIs server-side — a client-supplied redirect_uri
  // is a code-interception vector (CR#4). Configure via OAUTH_ALLOWED_REDIRECT_URIS
  // (GOOGLE_ALLOWED_REDIRECT_URIS is still read); the defaults cover local dev and
  // the desktop app's embedded server.
  const defaults = ['5173', process.env.CLIENT_PORT, '3005', process.env.PORT]
    .filter(Boolean)
    .map((port) => `http://localhost:${port}/auth/${provider}/callback`);
  const allowedRedirects = (process.env.OAUTH_ALLOWED_REDIRECT_URIS || process.env.GOOGLE_ALLOWED_REDIRECT_URIS || defaults.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
  const chosenRedirect = redirectUri || allowedRedirects[0];
  if (!allowedRedirects.includes(chosenRedirect)) {
    return res.status(400).json({ message: 'redirect_uri not allowed' });
  }

  try {
    let identity;
    try {
      identity = await fetchIdentity(provider, oauthConfig, code, chosenRedirect);
    } catch (e: any) {
      // Never echo provider responses back to the client (CR#4).
      console.error(`${label} OAuth:`, e?.message);
      return res.status(400).json({ message: `Failed to sign in with ${label}` });
    }
    const userData = { email: identity.email, name: identity.name, picture: identity.avatar };

    // 3. Find or create user
    let user = await UserRepository.findByEmail(userData.email);
    if (!user) {
      if (!config?.auth?.allowSelfRegistration) {
        return res.status(403).json({ message: 'Self registration is disabled' });
      }
      let created = false;
      try {
        user = await UserRepository.create({
          name: userData.name || userData.email.split('@')[0],
          email: userData.email.toLowerCase(),
          passwordHash: '',
          authType: 'sso',
          avatar: userData.picture,
          status: 'active',
        } as any);
        created = true;
      } catch (err: any) {
        // Two sign-ins for a brand-new email can race; the loser just uses the account the winner created.
        if (err?.name !== 'SequelizeUniqueConstraintError') throw err;
        user = await UserRepository.findByEmail(userData.email);
        if (!user) throw err;
      }
      if (created) {
        await createPersonalWorkspace(user);
        await logAudit(user._id as any, 'auth.register', { ip: req.ip, details: { method: provider } });
      }
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Account suspended' });
    }

    await UserRepository.update(user._id as any, { lastLoginAt: new Date() } as any);
    await logAudit(user._id as any, 'auth.login', { ip: req.ip, details: { method: provider } });

    const ttlDays = config?.auth.jwtTtlDays ?? 7;
    const token = signToken(String(user._id), ttlDays, user.tokenVersion ?? 0);
    setCookieToken(res, token, ttlDays);

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
        avatar: user.avatar,
      },
    });
  } catch (error: any) {
    console.error(`${label} OAuth Error:`, error);
    noteRouteError(res, error);
    return res.status(500).json({ message: `Internal server error during ${label} login` });
  }
};

for (const provider of OAUTH_PROVIDERS) {
  router.post(`/${provider}`, validate(schemas.oauthCodeSchema), loginLimiter, oauthLogin(provider));
}

// ── PUT /api/auth/settings ───────────────────────────────────────────
const ALLOWED_SETTINGS_KEYS = [
  'followRedirects', 'verifySsl', 'sendNoCacheHeader', 'encodeUrl', 'timeout',
  'proxyEnabled', 'proxyUrl', 'noProxy', 'proxyAuthEnabled', 'proxyUsername', 'proxyPassword',
  'saveHistory', 'sendCookies', 'shortcuts',
];

router.put('/settings', validate(schemas.updateSettingsSchema), authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  try {
    // Allowlist writable settings keys — don't merge arbitrary req.body (CR#7).
    const patch: Record<string, unknown> = {};
    for (const key of ALLOWED_SETTINGS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
    }
    const updatedUser = await UserRepository.update(user._id || (user as any).id, { settings: { ...user.settings, ...patch } } as any);
    return res.json(updatedUser!.settings);
  } catch (err: any) {
    // Don't echo internal error details back to the client.
    noteRouteError(res, err);
    return res.status(500).json({ message: 'Failed to update settings' });
  }
});

// ── POST /api/auth/certificates ──────────────────────────────────────
router.post('/certificates', validate(schemas.addCertificateSchema), authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { hostname, cert, key, passphrase } = req.body;
  if (!hostname || !cert || !key) return res.status(400).json({ message: 'hostname, cert, and key are required' });
  
  // P4.4: reject anything that is not a parseable certificate / private key pair.
  try {
    const x509 = new crypto.X509Certificate(cert);
    let keyObj: crypto.KeyObject;
    try {
      keyObj = crypto.createPrivateKey({ key, passphrase: passphrase || undefined });
    } catch (e: any) {
      const encrypted = /ENCRYPTED/.test(key);
      if (encrypted && !passphrase) return res.status(400).json({ message: 'The private key is encrypted - a passphrase is required' });
      if (encrypted) return res.status(400).json({ message: 'Wrong passphrase for the private key' });
      return res.status(400).json({ message: 'Invalid private key (expected a PEM private key)' });
    }
    if (!x509.checkPrivateKey(keyObj)) return res.status(400).json({ message: 'The private key does not match the certificate' });
  } catch {
    return res.status(400).json({ message: 'Invalid certificate (expected a PEM-encoded X.509 certificate)' });
  }

  try {
    const cryptoBox = await import('../utils/cryptoBox');
    const newCert = {
      _id: require('uuid').v4(),
      hostname,
      cert, // Spec doesn't mention sealing cert, just key and passphrase
      key: cryptoBox.seal(key),
      passphrase: passphrase ? cryptoBox.seal(passphrase) : undefined,
      createdAt: new Date()
    };
    // P4.8: one certificate per hostname - a new one replaces the existing entry.
    const sameHost = (c: any) => String(c.hostname).toLowerCase() === String(hostname).toLowerCase();
    const updatedCerts = [...(user.clientCertificates || []).filter((c: any) => !sameHost(c)), newCert];
    const updatedUser = await UserRepository.update(user._id || (user as any).id, { clientCertificates: updatedCerts } as any);
    
    // Return metadata only
    const safeCerts = (updatedUser!.clientCertificates || []).map((c: any) => ({
      _id: c._id,
      hostname: c.hostname,
      createdAt: c.createdAt
    }));
    return res.status(201).json(safeCerts);
  } catch (err: any) {
    noteRouteError(res, err);
    return res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/auth/certificates/:id ────────────────────────────────
router.delete('/certificates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  try {
    const updatedCerts = (user.clientCertificates || []).filter((c: any) => String(c._id) !== req.params.id);
    const updatedUser = await UserRepository.update(user._id || (user as any).id, { clientCertificates: updatedCerts } as any);

    // Return metadata only — never cert/key/passphrase (see POST /certificates above)
    const safeCerts = (updatedUser!.clientCertificates || []).map((c: any) => ({
      _id: c._id,
      hostname: c.hostname,
      createdAt: c.createdAt
    }));
    return res.json(safeCerts);
  } catch (err: any) {
    noteRouteError(res, err);
    return res.status(500).json({ message: err.message });
  }
});

export default router;

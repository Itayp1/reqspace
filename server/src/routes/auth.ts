import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { encryptSecret, publicCertificate } from '../utils/certCrypto';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { authenticate, AuthRequest, signToken, setCookieToken, clearAuthCookie, createPersonalWorkspace } from '../middleware/auth';
import { logAudit } from '../repositories/AuditLogRepository';
import { rateLimit } from '../middleware/rateLimit';
import { validateBody } from '../validation/validate';
import { certificateSchema, changePasswordSchema, loginSchema, registerSchema, settingsSchema } from '../validation/schemas';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../features/totp';

const router = Router();

// Login/password-guessing and account-creation throttles — this whole file
// was previously reachable with unlimited attempts per IP.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: 'Too many login attempts — please try again later.' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many accounts created from this address — please try again later.' });

// ── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', registerLimiter, validateBody(registerSchema), async (req: Request, res: Response) => {
  const config = await SystemConfigRepository.getConfig();

  if (!config?.auth.allowSelfRegistration) {
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
  const user = await UserRepository.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    authType: 'password',
  });

  // Auto-create personal workspace
  await createPersonalWorkspace(user);

  await logAudit(user._id as any, 'user.register', {
    ip: req.ip,
    details: { email },
  });

  const token = signToken(String(user._id), config.auth.jwtTtlDays);
  setCookieToken(res, token, config.auth.jwtTtlDays);

  return res.status(201).json({
    message: 'Registered successfully',
    // Session lives in the httpOnly cookie set above — the client never
    // reads a token field (grepped: unused), so it isn't echoed here too.
    user: { id: user._id, name: user.name, email: user.email },
  });
});

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', loginLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  const config = await SystemConfigRepository.getConfig();
  const mode = config?.auth.mode ?? 'login';

  if (mode === 'header') {
    return res.status(403).json({ message: 'Login form disabled. Use header authentication.' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const user = await UserRepository.findByEmail(email);
  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ message: 'Account suspended' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.settings?.totpEnabled) {
    if (!verifyTotp(String(user.settings.totpSecret || ''), String(req.body.otp || ''))) {
      return res.status(401).json({ message: 'Authentication code required', totpRequired: true });
    }
  }

  await UserRepository.update(user._id as any, { lastLoginAt: new Date() } as any);
  await logAudit(user._id as any, 'auth.login', { ip: req.ip });

  const ttlDays = config?.auth.jwtTtlDays ?? 7;
  const token = signToken(String(user._id), ttlDays);
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
router.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookie(res);
  return res.json({ message: 'Logged out' });
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  return res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    mustChangePassword: user.mustChangePassword,
    avatar: user.avatar,
    settings: user.settings,
    clientCertificates: (user.clientCertificates || []).map(publicCertificate),
    authType: user.authType,
  });
});

// ── GET /api/auth/config ─────────────────────────────────────────────────────
// Public endpoint – client needs to know what auth mode to show
router.get('/config', async (_req: Request, res: Response) => {
  const config = await SystemConfigRepository.getConfig();
  return res.json({
    mode: config?.auth.mode ?? 'login',
    allowSelfRegistration: config?.auth.allowSelfRegistration ?? false,
    googleOAuth: {
      enabled: config?.auth.googleOAuth?.enabled ?? false,
      clientId: config?.auth.googleOAuth?.clientId ?? '',
    }
  });
});

// ── POST /api/auth/change-password ──────────────────────────────────────────
router.post('/change-password', authenticate, validateBody(changePasswordSchema), async (req: AuthRequest, res: Response) => {
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

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await UserRepository.update(user._id as any, { passwordHash, mustChangePassword: false } as any);
  await logAudit(user._id as any, 'auth.change_password', { details: { forced: !!user.mustChangePassword } });
  return res.json({ message: 'Password changed successfully' });
});

// ── POST /api/auth/google ───────────────────────────────────────────────────
router.get('/google/start', (_req: Request, res: Response) => {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });
  return res.json({ state });
});

router.post('/google', loginLimiter, async (req: Request, res: Response) => {
  const { code, redirectUri, state } = req.body;
  if (!code) return res.status(400).json({ message: 'Code is required' });
  const cookieState = req.cookies?.oauth_state;
  const stateOk = typeof state === 'string' && typeof cookieState === 'string'
    && state.length === cookieState.length
    && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState));
  res.clearCookie('oauth_state', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  if (!stateOk) return res.status(400).json({ message: 'Invalid OAuth state' });

  const config = await SystemConfigRepository.getConfig();
  const oauthConfig = config?.auth.googleOAuth;
  if (!oauthConfig?.enabled) return res.status(403).json({ message: 'Google OAuth is disabled' });

  // Hard-allowlist redirect URIs server-side — a client-supplied redirect_uri
  // is a code-interception vector (CR#4). Configure via GOOGLE_ALLOWED_REDIRECT_URIS.
  const allowedRedirects = (process.env.GOOGLE_ALLOWED_REDIRECT_URIS || 'http://localhost:5173/auth/google/callback')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const chosenRedirect = redirectUri || allowedRedirects[0];
  if (!allowedRedirects.includes(chosenRedirect)) {
    return res.status(400).json({ message: 'redirect_uri not allowed' });
  }

  try {
    // 1. Exchange code for token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        redirect_uri: chosenRedirect,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResponse.json() as any;
    // Never echo the token endpoint's raw response back to the client (CR#4).
    if (tokenData.error) return res.status(400).json({ message: 'Failed to exchange token' });

    // 2. Fetch user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json() as any;
    if (!userData.email) return res.status(400).json({ message: 'No email found from Google' });

    // 3. Find or create user
    let user = await UserRepository.findByEmail(userData.email);
    if (!user) {
      if (!config?.auth.allowSelfRegistration) {
        return res.status(403).json({ message: 'Self registration is disabled' });
      }
      user = await UserRepository.create({
        name: userData.name || userData.email.split('@')[0],
        email: userData.email,
        passwordHash: '',
        authType: 'sso',
        avatar: userData.picture,
        status: 'active',
      } as any);
      
      await createPersonalWorkspace(user);
      await logAudit(user._id as any, 'auth.register', { ip: req.ip, details: { method: 'google' } });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Account suspended' });
    }

    await UserRepository.update(user._id as any, { lastLoginAt: new Date() } as any);
    await logAudit(user._id as any, 'auth.login', { ip: req.ip, details: { method: 'google' } });

    const ttlDays = config?.auth.jwtTtlDays ?? 7;
    const token = signToken(String(user._id), ttlDays);
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
    console.error('Google OAuth Error:', error);
    return res.status(500).json({ message: 'Internal server error during Google login' });
  }
});

// ── PUT /api/auth/settings ───────────────────────────────────────────
const ALLOWED_SETTINGS_KEYS = [
  'followRedirects', 'verifySsl', 'sendNoCacheHeader', 'encodeUrl', 'timeout',
  'proxyEnabled', 'proxyUrl', 'proxyAuthEnabled', 'proxyUsername', 'proxyPassword',
  'saveHistory', 'shortcuts',
];

router.put('/settings', authenticate, validateBody(settingsSchema), async (req: AuthRequest, res: Response) => {
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
    return res.status(500).json({ message: 'Failed to update settings' });
  }
});

// ── POST /api/auth/certificates ──────────────────────────────────────
router.post('/certificates', authenticate, validateBody(certificateSchema), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { hostname, cert, key, passphrase } = req.body;
  if (!hostname || !cert || !key) return res.status(400).json({ message: 'hostname, cert, and key are required' });
  
  try {
    const newCert = {
      _id: uuidv4(),
      hostname,
      cert,
      key: encryptSecret(key),
      passphrase: passphrase ? encryptSecret(passphrase) : '',
      createdAt: new Date(),
    };
    const updatedCerts = [...(user.clientCertificates || []), newCert];
    const updatedUser = await UserRepository.update(user._id || (user as any).id, { clientCertificates: updatedCerts } as any);
    return res.status(201).json((updatedUser!.clientCertificates || []).map(publicCertificate));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/auth/certificates/:id ────────────────────────────────
router.delete('/certificates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  try {
    const updatedCerts = (user.clientCertificates || []).filter((c: any) => String(c._id) !== req.params.id);
    const updatedUser = await UserRepository.update(user._id || (user as any).id, { clientCertificates: updatedCerts } as any);
    return res.json((updatedUser!.clientCertificates || []).map(publicCertificate));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.post('/totp/setup', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const secret = generateTotpSecret();
  await UserRepository.update(user._id, { settings: { ...user.settings, totpPending: secret } } as any);
  return res.json({ secret, url: otpauthUrl(user.email, secret) });
});

router.post('/totp/enable', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const pending = String(user.settings?.totpPending || '');
  if (!verifyTotp(pending, String(req.body?.code || ''))) {
    return res.status(400).json({ message: 'Invalid authentication code' });
  }
  const { totpPending: _pending, ...rest } = user.settings || {};
  await UserRepository.update(user._id, { settings: { ...rest, totpSecret: pending, totpEnabled: true } } as any);
  return res.json({ enabled: true });
});

router.post('/totp/disable', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  if (user.settings?.totpEnabled && !verifyTotp(String(user.settings.totpSecret || ''), String(req.body?.code || ''))) {
    return res.status(400).json({ message: 'Invalid authentication code' });
  }
  const settings = { ...user.settings, totpEnabled: false, totpSecret: '' };
  await UserRepository.update(user._id, { settings } as any);
  return res.json({ enabled: false });
});

export default router;

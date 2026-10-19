import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long (max 100 characters)')
    .refine((v) => !/[<>]/.test(v), 'Name cannot contain < or > characters'),
  email: z.string().trim().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters')
}).strict();

// Login accepts a bare username ("admin") as well as an email, so only values
// that contain "@" must be well-formed emails (A1.7); surrounding spaces are
// trimmed (A1.6).
export const loginSchema = z.object({
  email: z.string().trim().refine(
    (v) => !v.includes('@') || z.string().email().safeParse(v).success,
    'Invalid email',
  ),
  password: z.string()
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
}).strict();

export const oauthCodeSchema = z.object({
  code: z.string(),
  redirectUri: z.string().url(),
  state: z.string()
}).strict();
export const googleAuthSchema = oauthCodeSchema;

// Known settings are validated; unknown keys pass through and are dropped by the
// route's allowlist. timeout is in ms (0 = none), capped at 1 hour (P2.2).
export const updateSettingsSchema = z.object({
  followRedirects: z.boolean().optional(),
  verifySsl: z.boolean().optional(),
  sendNoCacheHeader: z.boolean().optional(),
  encodeUrl: z.boolean().optional(),
  timeout: z.number().int().min(0).max(3600000).optional(),
  proxyEnabled: z.boolean().optional(),
  proxyUrl: z.string().max(2048).optional(),
  noProxy: z.string().max(2048).optional(),
  proxyAuthEnabled: z.boolean().optional(),
  proxyUsername: z.string().max(512).optional(),
  proxyPassword: z.string().max(512).optional(),
  saveHistory: z.boolean().optional(),
  sendCookies: z.boolean().optional(),
  shortcuts: z.record(z.string().max(64)).optional(),
}).passthrough();

export const addCertificateSchema = z.object({
  hostname: z.string(),
  cert: z.string(),
  key: z.string(),
  passphrase: z.string().optional()
}).strict();

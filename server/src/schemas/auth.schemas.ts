import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters')
}).strict();

export const loginSchema = z.object({
  email: z.string(),
  password: z.string()
}).strict();

export const changePasswordSchema = z.object({
  // Optional: the forced first-login change (mustChangePassword) is exempt
  // from proving the current password — see routes/auth.ts's handler. A
  // required field here rejects that request before the handler ever runs,
  // which is exactly the case this schema needs to allow.
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
}).strict();

export const googleAuthSchema = z.object({
  code: z.string(),
  redirectUri: z.string().url(),
  state: z.string()
}).strict();

export const updateSettingsSchema = z.record(z.any()); // Settings are unstructured JSON in DB for now, but strict is required? Let's just do z.record(z.any()) or z.any() for now. Wait, strict() doesn't apply to records. We will not use strict on settings if it's dynamic.

export const addCertificateSchema = z.object({
  hostname: z.string(),
  cert: z.string(),
  key: z.string(),
  passphrase: z.string().optional()
}).strict();

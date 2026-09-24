import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  otp: z.string().optional(),
}).strict();

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(8),
}).strict();

export const changePasswordSchema = z.object({
  newPassword: z.string().min(8),
  currentPassword: z.string().optional(),
}).strict();

export const settingsSchema = z.object({
  followRedirects: z.boolean().optional(),
  verifySsl: z.boolean().optional(),
  sendNoCacheHeader: z.boolean().optional(),
  encodeUrl: z.boolean().optional(),
  timeout: z.number().optional(),
  proxyEnabled: z.boolean().optional(),
  proxyUrl: z.string().optional(),
  proxyAuthEnabled: z.boolean().optional(),
  proxyUsername: z.string().optional(),
  proxyPassword: z.string().optional(),
  saveHistory: z.boolean().optional(),
  clientCertPath: z.string().optional(),
  shortcuts: z.record(z.string()).optional(),
}).strip();

export const certificateSchema = z.object({
  hostname: z.string().min(1),
  cert: z.string().min(1),
  key: z.string().min(1),
  passphrase: z.string().optional(),
}).strict();

export const adminConfigSchema = z.object({
  auth: z.record(z.any()).optional(),
  history: z.record(z.any()).optional(),
  proxy: z.record(z.any()).optional(),
}).strip();

export const proxySchema = z.object({
  method: z.string(),
  url: z.string().min(1),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  workspaceId: z.string().optional(),
  followRedirects: z.boolean().optional(),
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  localProxy: z.any().optional(),
  saveHistory: z.boolean().optional(),
}).passthrough();

export const historySaveSchema = z.object({
  collectionId: z.string().min(1),
  folderId: z.string().nullable().optional(),
  name: z.string().optional(),
}).strict();

export const wsdlImportSchema = z.object({
  url: z.string().url(),
  workspaceId: z.string().min(1),
}).strict();

export const collectionImportSchema = z.object({
  workspaceId: z.string().min(1),
  collection: z.record(z.any()),
}).strict();

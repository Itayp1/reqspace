import { NextFunction, Request, Response } from 'express';
import { z, ZodTypeAny } from 'zod';

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Invalid request body';
      return res.status(400).json({ message });
    }
    req.body = parsed.data;
    next();
  };
}

const loose = z.unknown();

export const registerBody = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginBody = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export const changePasswordBody = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  currentPassword: z.string().optional(),
});

export const googleBody = z.object({
  code: z.string().min(1, 'Code is required'),
  redirectUri: z.string().optional(),
  state: z.string().optional(),
});

export const certificateBody = z.object({
  hostname: z.string().trim().min(1),
  cert: z.string().min(1),
  key: z.string().min(1),
  passphrase: z.string().optional(),
});

export const adminCreateUserBody = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  isSuperAdmin: z.boolean().optional(),
});

export const adminUpdateUserBody = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  status: z.enum(['active', 'suspended']).optional(),
  password: z.string().min(8).optional(),
});

export const collectionWriteBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  variables: z.array(z.record(z.unknown())).optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  order: z.number().optional(),
});

export const collectionCreateBody = collectionWriteBody.extend({
  name: z.string().trim().min(1, 'name required'),
});

export const folderWriteBody = z.object({
  name: z.string().trim().min(1).optional(),
  parentFolderId: z.string().nullable().optional(),
  description: z.string().optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  order: z.number().optional(),
});

export const folderCreateBody = folderWriteBody.extend({
  name: z.string().trim().min(1, 'name required'),
});

export const requestWriteBody = z.object({
  name: z.string().optional(),
  method: z.string().optional(),
  url: z.string().optional(),
  params: loose.optional(),
  headers: loose.optional(),
  auth: loose.optional(),
  body: loose.optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  description: z.string().optional(),
  folderId: z.string().nullable().optional(),
  order: z.number().optional(),
});

export const commentBody = z.object({
  text: z.string().trim().min(1, 'Text is required'),
});

export const reorderBody = z.object({
  type: z.enum(['collection', 'folder', 'request']),
  items: z.array(z.object({ id: z.string().min(1), order: z.number() })),
});

export const proxyBody = z.object({
  method: z.string().min(1),
  url: z.string().min(1, 'url is required'),
  headers: z.record(z.string()).optional(),
  body: loose.optional(),
  workspaceId: z.string().optional(),
  followRedirects: z.boolean().optional(),
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  localProxy: loose.optional(),
  saveHistory: z.boolean().optional(),
  clientCertPath: z.string().optional(),
});

const envVariable = z.object({
  key: z.string(),
  value: z.string().optional(),
  type: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const workspaceCreateBody = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const workspaceUpdateBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
});

export const memberInviteBody = z.object({
  email: z.string().trim().min(1),
  role: z.enum(['viewer', 'editor', 'owner']),
});

export const memberRoleBody = z.object({
  role: z.enum(['viewer', 'editor', 'owner']),
});

export const settingsBody = z.object({
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
  shortcuts: z.record(z.string()).optional(),
});

export const environmentCreateBody = z.object({
  name: z.string().trim().min(1, 'name required'),
  isGlobal: z.boolean().optional(),
  variables: z.array(envVariable).optional(),
});

export const environmentUpdateBody = z.object({
  name: z.string().trim().min(1).optional(),
  variables: z.array(envVariable).optional(),
  order: z.number().optional(),
  isGlobal: z.boolean().optional(),
});

export const environmentReorderBody = z.object({
  items: z.array(z.object({ id: z.string().min(1), order: z.number() })),
});

export const environmentDuplicateBody = z.object({
  workspaceId: z.string().optional(),
});

export const historySaveBody = z.object({
  collectionId: z.string().min(1, 'collectionId required'),
  folderId: z.string().nullable().optional(),
  name: z.string().optional(),
});

export const wsdlImportBody = z.object({
  url: z.string().min(1),
  workspaceId: z.string().min(1),
});

export const curlImportBody = z.object({
  curl: z.string().min(1, 'curl string required'),
  workspaceId: z.string().optional(),
});

export const rawImportBody = z.object({
  raw: z.string().min(1, 'raw HTTP string required'),
  workspaceId: z.string().optional(),
});

const v21Doc = z.object({
  item: z.array(z.unknown()),
  info: z.unknown().optional(),
  variable: z.unknown().optional(),
  event: z.unknown().optional(),
}).passthrough();

export const collectionImportBody = z.object({
  workspaceId: z.string().min(1, 'workspaceId required'),
  collection: v21Doc.optional(),
  item: z.array(z.unknown()).optional(),
  info: z.unknown().optional(),
  variable: z.unknown().optional(),
  event: z.unknown().optional(),
}).passthrough();

export const shareCreateBody = z.object({
  expiresInDays: z.union([z.number(), z.string()]).optional(),
});

export const shareProxyBody = z.object({
  method: z.string().min(1),
  url: z.string().min(1, 'url is required'),
  headers: z.record(z.string()).optional(),
  body: loose.optional(),
  followRedirects: z.boolean().optional(),
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  localProxy: loose.optional(),
});

const googleOAuthConfig = z.object({
  enabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

const smtpConfig = z.object({
  enabled: z.boolean().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  user: z.string().optional(),
  pass: z.string().optional(),
  fromAddress: z.string().optional(),
});

export const adminConfigBody = z.object({
  auth: z.object({
    mode: z.enum(['login', 'header', 'both']).optional(),
    headerName: z.string().optional(),
    allowSelfRegistration: z.boolean().optional(),
    allowedEmailDomains: z.array(z.string()).optional(),
    jwtTtlDays: z.number().optional(),
    jwtRefreshHoursBeforeExpiry: z.number().optional(),
    googleOAuth: googleOAuthConfig.optional(),
    smtp: smtpConfig.optional(),
  }).optional(),
  history: z.object({
    maxRequestBodyKB: z.number().optional(),
    maxTotalPerUserMB: z.number().optional(),
    cleanupPolicy: z.literal('fifo').optional(),
  }).optional(),
  proxy: z.object({
    enabled: z.boolean().optional(),
    url: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    allowPrivateTargets: z.boolean().optional(),
  }).optional(),
});

export const smtpTestBody = z.object({
  host: z.string().min(1),
  port: z.union([z.number(), z.string()]),
  user: z.string().optional(),
  pass: z.string().optional(),
  fromAddress: z.string().optional(),
});

export const adminImportBody = z.object({
  collections: z.array(z.record(z.unknown())).optional(),
  folders: z.array(z.record(z.unknown())).optional(),
  requests: z.array(z.record(z.unknown())).optional(),
  environments: z.array(z.record(z.unknown())).optional(),
});

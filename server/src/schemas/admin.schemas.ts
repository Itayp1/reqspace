import { z } from 'zod';

// Mirrors the shape AdminPage sends (the stored SystemConfig minus its id).
// Nested objects are plain z.object(), which strips unknown keys rather than
// rejecting them — so every field the settings screen edits has to be listed
// here, or the save silently drops it. googleOAuth, smtp, allowedEmailDomains
// and the proxy credentials used to be missing, which meant the admin could
// never store an SMTP server or Google OAuth client from the UI.
// Empty clears the field; otherwise it must be an http(s) URL.
const httpUrl = z.string().refine((v) => v === '' || /^https?:\/\//i.test(v) && URL.canParse(v), 'Must be an http(s) URL').optional();

const oauthProviderSchema = z.object({
  enabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

export const updateConfigSchema = z.object({
  auth: z.object({
    allowSelfRegistration: z.boolean().optional(),
    allowedEmailDomains: z.array(z.string()).optional(),
    jwtTtlDays: z.number().int().min(1).max(365).optional(),
    jwtRefreshHoursBeforeExpiry: z.number().int().min(0).max(8760).optional(),
    googleOAuth: oauthProviderSchema.optional(),
    githubOAuth: oauthProviderSchema.optional(),
    customOAuth: oauthProviderSchema.extend({
      name: z.string().max(40).refine((v) => !/[<>]/.test(v), 'Name cannot contain < or >').optional(),
      authorizeUrl: httpUrl,
      tokenUrl: httpUrl,
      userinfoUrl: httpUrl,
      scope: z.string().max(200).optional(),
    }).optional(),
    microsoftOAuth: oauthProviderSchema.extend({
      tenantId: z.string().regex(/^[A-Za-z0-9.-]*$/, 'Invalid tenant').optional(),
    }).optional(),
    smtp: z.object({
      enabled: z.boolean().optional(),
      host: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      user: z.string().optional(),
      pass: z.string().optional(),
      fromAddress: z.string().optional(),
    }).optional(),
  }).optional(),
  proxy: z.object({
    enabled: z.boolean().optional(),
    url: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    allowPrivateTargets: z.boolean().optional()
  }).optional(),
  history: z.object({
    // Positive, bounded integers: a negative or absurd limit would be stored
    // as-is and then break eviction/truncation. 0 means "no limit" for the two
    // retention knobs.
    maxRequestBodyKB: z.number().int().min(1).max(102400).optional(),
    maxTotalPerUserMB: z.number().int().min(1).max(102400).optional(),
    maxRecords: z.number().int().min(0).max(10_000_000).optional(),
    retentionDays: z.number().int().min(0).max(36500).optional(),
    cleanupPolicy: z.enum(['fifo']).optional(),
  }).optional(),
});

/**
 * POST /api/admin/users. The Add User modal has always posted this shape;
 * the route itself did not exist, so every attempt 404'd and the modal just
 * sat there saying "Failed to create user".
 */
export const createUserSchema = z.object({
  name: z.string().min(1).refine((v) => !/[<>]/.test(v), 'Name cannot contain < or > characters'),
  email: z.string().email(),
  password: z.string().min(8),
  isSuperAdmin: z.boolean().optional(),
}).strict();

export const emptyBodySchema = z.object({}).strict();

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
}).strict();

export const testSmtpSchema = z.object({
  enabled: z.boolean().optional(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().optional(),
  pass: z.string().optional(),
  fromAddress: z.string().optional(),
}).strict();

export const importDumpSchema = z.record(z.any()); // passthrough because multer adds fields

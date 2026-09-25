import { z } from 'zod';

export const updateConfigSchema = z.object({
  auth: z.object({
    mode: z.enum(['login', 'header', 'both']).optional(),
    allowSelfRegistration: z.boolean().optional(),
    headerName: z.string().optional(),
    jwtTtlDays: z.number().optional(),
    jwtRefreshHoursBeforeExpiry: z.number().optional()
  }).optional(),
  proxy: z.object({
    enabled: z.boolean().optional(),
    url: z.string().optional(),
    allowPrivateTargets: z.boolean().optional()
  }).optional(),
  history: z.object({
    maxRequestBodyKB: z.number().optional(),
    maxTotalPerUserMB: z.number().optional()
  }).optional(),
  smtp: z.object({
    host: z.string().optional(),
    port: z.number().optional(),
    user: z.string().optional(),
    pass: z.string().optional(),
    from: z.string().optional()
  }).optional(),
  google: z.object({
    enabled: z.boolean().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional()
  }).optional()
}).strict();

export const importDumpSchema = z.record(z.any()); // passthrough because multer adds fields

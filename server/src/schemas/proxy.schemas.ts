import { z } from 'zod';

// proxy routes take very dynamic inputs, we can just use a loose schema or specific one
export const proxyRequestSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.any().optional(),
  body: z.any().optional(),
  workspaceId: z.string().optional(),
  followRedirects: z.boolean().optional(),
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  localProxy: z.any().optional(),
  saveHistory: z.boolean().optional()
}).strict();

import { z } from 'zod';

export const createShareSchema = z.object({
  expiresInDays: z.number().nullable().optional()
}).strict();

export const forkShareSchema = z.object({
  workspaceId: z.string().min(1)
}).strict();

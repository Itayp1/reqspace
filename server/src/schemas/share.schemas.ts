import { z } from 'zod';

export const createShareSchema = z.object({
  expiresInDays: z.number().nullable().optional()
}).strict();

import { z } from 'zod';

export const updateLocalVariablesSchema = z.object({
  variables: z.array(z.object({
    key: z.string(),
    value: z.string(),
    enabled: z.boolean().optional()
  }).strict())
}).strict();

import { z } from 'zod';

// Mirrors the user-profile-variables schema deliberately: both are edited by
// the same component (LocalVariablesEditor), which tags every row with a
// `type`. This schema used to omit it and reject the whole payload under
// .strict(), so saving a local variable always failed with a 400.
export const updateLocalVariablesSchema = z.object({
  variables: z.array(z.object({
    key: z.string(),
    value: z.string().optional().default(''),
    enabled: z.boolean().optional().default(true),
    type: z.enum(['default', 'secret']).optional().default('default'),
  }).strict())
}).strict();

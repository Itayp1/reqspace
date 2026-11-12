import { z } from 'zod';

export const createEnvironmentSchema = z.object({
  name: z.string().min(1),
  variables: z.any().optional()
}).strict();

export const updateEnvironmentSchema = z.object({
  name: z.string().min(1).optional(),
  variables: z.any().optional()
}).strict();

export const duplicateEnvironmentSchema = z.object({
  workspaceId: z.string().optional()
}).strict();

export const updateGlobalEnvironmentSchema = z.object({
  variables: z.any()
}).strict();

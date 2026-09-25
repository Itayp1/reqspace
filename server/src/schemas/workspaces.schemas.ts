import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isPublic: z.boolean().optional()
}).strict();

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional()
}).strict();

export const addWorkspaceMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['viewer', 'editor']) // Assuming roles are viewer/editor
}).strict();

export const updateWorkspaceMemberSchema = z.object({
  role: z.enum(['viewer', 'editor', 'owner'])
}).strict();

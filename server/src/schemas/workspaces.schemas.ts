import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isPublic: z.boolean().optional()
}).strict();

export const duplicateWorkspaceSchema = z.object({
  name: z.string().min(1),
  includeCollections: z.boolean().optional(),
  includeEnvironments: z.boolean().optional(),
  includeSecretValues: z.boolean().optional(),
  includeMembers: z.boolean().optional(),
}).strict();

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional()
}).strict();

export const addWorkspaceMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(['viewer', 'editor', 'owner'])
}).strict();

export const createInviteLinkSchema = z.object({
  role: z.enum(['viewer', 'editor', 'owner']),
  singleUse: z.boolean(),
  expiresIn: z.enum(['1h', '1d']),
}).strict();

export const updateWorkspaceMemberSchema = z.object({
  role: z.enum(['viewer', 'editor', 'owner'])
}).strict();

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
}).strict();

export const proxySchema = z.object({
  method: z.string(),
  url: z.string().min(1),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  workspaceId: z.string().optional(),
  followRedirects: z.boolean().optional(),
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  localProxy: z.any().optional(),
  saveHistory: z.boolean().optional(),
}).passthrough();

export const historySaveSchema = z.object({
  collectionId: z.string().min(1),
  folderId: z.string().nullable().optional(),
  name: z.string().optional(),
}).strict();

export const wsdlImportSchema = z.object({
  url: z.string().url(),
  workspaceId: z.string().min(1),
}).strict();

export const collectionImportSchema = z.object({
  workspaceId: z.string().min(1),
  collection: z.record(z.any()),
}).strict();

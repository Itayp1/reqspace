import { z } from 'zod';

export const importCurlSchema = z.object({
  curl: z.string(),
  workspaceId: z.string()
}).strict();

export const importRawHttpSchema = z.object({
  raw: z.string(),
  workspaceId: z.string()
}).strict();

export const importWsdlSchema = z.object({
  url: z.string().url(),
  workspaceId: z.string()
}).strict();

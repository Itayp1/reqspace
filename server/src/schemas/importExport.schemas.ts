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
  // The WSDL document itself. The client fetches any URL from the user's machine; the server never does.
  wsdl: z.string().min(1).max(5_000_000),
  workspaceId: z.string()
}).strict();

export const importCollectionSchema = z.object({
  workspaceId: z.string(),
  collection: z.any()
}).strict();

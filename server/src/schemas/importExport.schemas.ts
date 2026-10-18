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
  url: z.string().url().optional(),
  // The WSDL document itself, for services that are not reachable from the server.
  wsdl: z.string().min(1).max(5_000_000).optional(),
  workspaceId: z.string()
}).strict().refine(d => !!d.url !== !!d.wsdl, { message: 'Provide either url or wsdl' });

export const importCollectionSchema = z.object({
  workspaceId: z.string(),
  collection: z.any()
}).strict();

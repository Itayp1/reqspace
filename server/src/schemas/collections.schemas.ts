import { z } from 'zod';

export const createCollectionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  variables: z.any().optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional()
}).strict();

export const updateCollectionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  variables: z.any().optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  order: z.number().optional()
}).strict();

export const createFolderSchema = z.object({
  name: z.string().min(1),
  parentFolderId: z.string().nullable().optional(),
  description: z.string().optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional()
}).strict();

export const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  parentFolderId: z.string().nullable().optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  order: z.number().optional()
}).strict();

export const requestAuthSchema = z.object({
  type: z.enum(['none', 'basic', 'bearer', 'oauth2', 'header', 'apikey', 'ntlm', 'inherit']),
  basic: z.object({ username: z.string(), password: z.string() }).optional(),
  bearer: z.object({ token: z.string() }).optional(),
  header: z.object({ key: z.string(), value: z.string() }).optional(),
  apikey: z.object({ key: z.string(), value: z.string(), in: z.enum(['header', 'query']) }).optional(),
  ntlm: z.object({ username: z.string().optional(), password: z.string().optional(), domain: z.string().optional(), workstation: z.string().optional() }).optional(),
  oauth2: z.record(z.any()).optional()
}).strict();

export const requestItemSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().optional(),
  type: z.string().optional(),
  content: z.string().optional(),
  filename: z.string().optional()
}).strict();

export const requestBodySchema = z.object({
  mode: z.enum(['none', 'raw', 'urlencoded', 'form-data', 'binary', 'graphql']),
  raw: z.string().optional(),
  rawLanguage: z.enum(['json', 'text', 'xml', 'html', 'javascript']).optional(),
  urlencoded: z.array(requestItemSchema).optional(),
  formData: z.array(requestItemSchema).optional(),
  graphql: z.object({ query: z.string(), variables: z.string() }).optional(),
  _isFormData: z.boolean().optional(),
  items: z.array(requestItemSchema).optional()
}).strict();

export const createRequestSchema = z.object({
  name: z.string().min(1),
  method: z.string(),
  url: z.string(),
  params: z.array(requestItemSchema).optional(),
  headers: z.array(requestItemSchema).optional(),
  auth: requestAuthSchema.optional(),
  body: requestBodySchema.optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  description: z.string().optional(),
  folderId: z.string().nullable().optional()
}).strict();

export const updateRequestSchema = createRequestSchema.partial().extend({
  order: z.number().optional()
}).strict();

export const addCommentSchema = z.object({
  text: z.string().min(1)
}).strict();

export const reorderSchema = z.object({
  type: z.enum(['collection', 'folder', 'request']),
  items: z.array(z.object({
    id: z.string(),
    order: z.number()
  }).strict())
}).strict();

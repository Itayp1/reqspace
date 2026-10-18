import { z } from 'zod';

export const requestAuthSchema = z.object({
  type: z.enum(['none', 'basic', 'bearer', 'oauth2', 'header', 'apikey', 'ntlm', 'inherit']),
  basic: z.object({ username: z.string(), password: z.string() }).optional(),
  bearer: z.object({ token: z.string(), prefix: z.string().max(50).optional() }).optional(),
  header: z.object({ key: z.string(), value: z.string() }).optional(),
  apikey: z.object({ key: z.string(), value: z.string(), in: z.enum(['header', 'query']) }).optional(),
  ntlm: z.object({ username: z.string().optional(), password: z.string().optional(), domain: z.string().optional(), workstation: z.string().optional() }).optional(),
  oauth2: z.record(z.any()).optional()
}).strict();

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  variables: z.any().optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional()
}).strict();

export const updateCollectionSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  variables: z.any().optional(),
  auth: requestAuthSchema.optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  order: z.number().optional()
}).strict();

export const createFolderSchema = z.object({
  name: z.string().trim().min(1),
  parentFolderId: z.string().nullable().optional(),
  description: z.string().optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional()
}).strict();

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  collectionId: z.string().optional(),
  parentFolderId: z.string().nullable().optional(),
  auth: requestAuthSchema.optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  order: z.number().optional()
}).strict();

// Not .strict(): a row can legitimately carry client-side extras — the
// browser File object behind a form-data file row (`file`), or the `_id` that
// WSDL-imported headers were stored with. Rejecting those failed the whole
// save with a 400; stripping them keeps the row and drops the noise.
export const requestItemSchema = z.object({
  key: z.string(),
  value: z.preprocess((v) => (v == null ? '' : typeof v === 'string' ? v : String(v)), z.string()),
  enabled: z.boolean().optional(),
  type: z.string().optional(),
  content: z.string().optional(),
  filename: z.string().optional(),
  description: z.string().optional()
});

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

// Per-request overrides of the global settings, plus the connection settings of a
// saved WS / Socket.IO / SSE connection tab.
export const requestSettingsSchema = z.object({
  followRedirects: z.boolean().optional(),
  verifySsl: z.boolean().optional(),
  timeout: z.number().int().min(0).max(3600000).optional(),
  encodeUrl: z.boolean().optional(),
  connection: z.record(z.any()).optional()
}).strict();

export const createRequestSchema = z.object({
  name: z.string().trim().min(1),
  method: z.string(),
  url: z.string(),
  params: z.array(requestItemSchema).optional(),
  headers: z.array(requestItemSchema).optional(),
  auth: requestAuthSchema.optional(),
  body: requestBodySchema.optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
  description: z.string().optional(),
  settings: requestSettingsSchema.optional(),
  folderId: z.string().nullable().optional()
}).strict();

export const updateRequestSchema = createRequestSchema.partial().extend({
  collectionId: z.string().optional(),
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

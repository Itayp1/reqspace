const fs = require('fs');
const path = require('path');

const schemasDir = path.join(__dirname, 'server', 'src', 'schemas');
if (!fs.existsSync(schemasDir)) fs.mkdirSync(schemasDir, { recursive: true });

const generate = (filename, content) => {
  fs.writeFileSync(path.join(schemasDir, filename), content);
};

// auth.schemas.ts
generate('auth.schemas.ts', `import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters')
}).strict();

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string()
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
}).strict();

export const googleAuthSchema = z.object({
  code: z.string(),
  redirectUri: z.string().url()
}).strict();

export const updateSettingsSchema = z.record(z.any()); // Settings are unstructured JSON in DB for now, but strict is required? Let's just do z.record(z.any()) or z.any() for now. Wait, strict() doesn't apply to records. We will not use strict on settings if it's dynamic.

export const addCertificateSchema = z.object({
  hostname: z.string(),
  cert: z.string(),
  key: z.string(),
  passphrase: z.string().optional()
}).strict();
`);

// admin.schemas.ts
generate('admin.schemas.ts', `import { z } from 'zod';

export const updateConfigSchema = z.object({
  auth: z.object({
    mode: z.enum(['login', 'header', 'both']).optional(),
    allowSelfRegistration: z.boolean().optional(),
    headerName: z.string().optional(),
    jwtTtlDays: z.number().optional(),
    jwtRefreshHoursBeforeExpiry: z.number().optional()
  }).optional(),
  proxy: z.object({
    enabled: z.boolean().optional(),
    url: z.string().optional(),
    allowPrivateTargets: z.boolean().optional()
  }).optional(),
  history: z.object({
    maxRequestBodyKB: z.number().optional(),
    maxTotalPerUserMB: z.number().optional()
  }).optional(),
  smtp: z.object({
    host: z.string().optional(),
    port: z.number().optional(),
    user: z.string().optional(),
    pass: z.string().optional(),
    from: z.string().optional()
  }).optional(),
  google: z.object({
    enabled: z.boolean().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional()
  }).optional()
}).strict();

export const importDumpSchema = z.object({
  // Multipart form data is used, but if it's JSON, we should accept any since it's a huge dump
  // Actually, importDump is done via multer file upload, so the body might be empty or have workspaceId
  // Wait, in admin.ts, POST /import/:workspaceId is multipart/form-data. req.body might be empty.
}).passthrough(); // passthrough because multer adds fields
`);

// workspaces.schemas.ts
generate('workspaces.schemas.ts', `import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isPublic: z.boolean().optional()
}).strict();

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional()
}).strict();
`);

// collections.schemas.ts
generate('collections.schemas.ts', `import { z } from 'zod';

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
  type: z.enum(['none', 'basic', 'bearer', 'oauth2', 'header']),
  basic: z.object({ username: z.string(), password: z.string() }).optional(),
  bearer: z.object({ token: z.string() }).optional(),
  header: z.object({ key: z.string(), value: z.string() }).optional(),
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
  mode: z.enum(['none', 'raw', 'urlencoded', 'formdata', 'graphql']),
  raw: z.string().optional(),
  urlencoded: z.array(requestItemSchema).optional(),
  formdata: z.array(requestItemSchema).optional(),
  graphql: z.object({ query: z.string(), variables: z.string() }).optional(),
  _isFormData: z.boolean().optional(),
  items: z.array(requestItemSchema).optional() // used by proxy sometimes?
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
`);

// environments.schemas.ts
generate('environments.schemas.ts', `import { z } from 'zod';

export const createEnvironmentSchema = z.object({
  name: z.string().min(1),
  variables: z.any().optional()
}).strict();

export const updateEnvironmentSchema = z.object({
  name: z.string().min(1).optional(),
  variables: z.any().optional()
}).strict();
`);

// history.schemas.ts
generate('history.schemas.ts', `import { z } from 'zod';

export const saveHistorySchema = z.object({
  collectionId: z.string(),
  folderId: z.string().nullable().optional(),
  name: z.string().optional()
}).strict();
`);

// importExport.schemas.ts
generate('importExport.schemas.ts', `import { z } from 'zod';

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
`);

// proxy.schemas.ts
generate('proxy.schemas.ts', `import { z } from 'zod';

// proxy routes take very dynamic inputs, we can just use a loose schema or specific one
export const proxyRequestSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.any().optional(),
  body: z.any().optional(),
  workspaceId: z.string().optional(),
  followRedirects: z.boolean().optional(),
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  localProxy: z.any().optional(),
  saveHistory: z.boolean().optional()
}).strict();
`);

// localVariables.schemas.ts
generate('localVariables.schemas.ts', `import { z } from 'zod';

export const updateLocalVariablesSchema = z.object({
  variables: z.array(z.object({
    key: z.string(),
    value: z.string(),
    enabled: z.boolean().optional()
  }).strict())
}).strict();
`);

// share.schemas.ts
generate('share.schemas.ts', `import { z } from 'zod';

export const createShareSchema = z.object({
  expiresInDays: z.number().nullable().optional()
}).strict();
`);

console.log('Schemas generated');

const fs = require('fs');
const path = require('path');

const map = {
  'admin.ts': [
    { route: "PUT /config", regex: /router\.put\('\/config'/g, schema: 'updateConfigSchema' },
    { route: "POST /import/:workspaceId", regex: /router\.post\('\/import\/:workspaceId'/g, schema: 'importDumpSchema' }
  ],
  'auth.ts': [
    { route: "POST /register", regex: /router\.post\('\/register'/g, schema: 'registerSchema' },
    { route: "POST /login", regex: /router\.post\('\/login'/g, schema: 'loginSchema' },
    { route: "POST /logout", regex: /router\.post\('\/logout'/g, schema: 'z.any()' }, // No body expected, but let's use z.any() inline or empty schema
    { route: "POST /change-password", regex: /router\.post\('\/change-password'/g, schema: 'changePasswordSchema' },
    { route: "POST /google", regex: /router\.post\('\/google'/g, schema: 'googleAuthSchema' },
    { route: "PUT /settings", regex: /router\.put\('\/settings'/g, schema: 'updateSettingsSchema' },
    { route: "POST /certificates", regex: /router\.post\('\/certificates'/g, schema: 'addCertificateSchema' }
  ],
  'collections.ts': [
    { route: "POST /workspaces/:workspaceId/collections", regex: /router\.post\('\/workspaces\/:workspaceId\/collections'/g, schema: 'createCollectionSchema' },
    { route: "PUT /collections/:id", regex: /router\.put\('\/collections\/:id'/g, schema: 'updateCollectionSchema' },
    { route: "POST /collections/:collectionId/folders", regex: /router\.post\('\/collections\/:collectionId\/folders'/g, schema: 'createFolderSchema' },
    { route: "PUT /folders/:id", regex: /router\.put\('\/folders\/:id'/g, schema: 'updateFolderSchema' },
    { route: "POST /collections/:collectionId/requests", regex: /router\.post\('\/collections\/:collectionId\/requests'/g, schema: 'createRequestSchema' },
    { route: "PUT /requests/:id", regex: /router\.put\('\/requests\/:id'/g, schema: 'updateRequestSchema' },
    { route: "POST /requests/:id/comments", regex: /router\.post\('\/requests\/:id\/comments'/g, schema: 'addCommentSchema' },
    { route: "PUT /reorder", regex: /router\.put\('\/reorder'/g, schema: 'reorderSchema' }
  ],
  'environments.ts': [
    { route: "POST /workspaces/:workspaceId/environments", regex: /router\.post\('\/workspaces\/:workspaceId\/environments'/g, schema: 'createEnvironmentSchema' },
    { route: "PUT /environments/:id", regex: /router\.put\('\/environments\/:id'/g, schema: 'updateEnvironmentSchema' }
  ],
  'history.ts': [
    { route: "POST /history/:id/save", regex: /router\.post\('\/history\/:id\/save'/g, schema: 'saveHistorySchema' }
  ],
  'importExport.ts': [
    { route: "POST /requests/import/curl", regex: /router\.post\('\/requests\/import\/curl'/g, schema: 'importCurlSchema' },
    { route: "POST /requests/import/raw-http", regex: /router\.post\('\/requests\/import\/raw-http'/g, schema: 'importRawHttpSchema' },
    { route: "POST /import/wsdl", regex: /router\.post\('\/import\/wsdl'/g, schema: 'importWsdlSchema' }
  ],
  'localVariables.ts': [
    { route: "PUT /:workspaceId", regex: /router\.put\('\/:workspaceId'/g, schema: 'updateLocalVariablesSchema' }
  ],
  'proxy.ts': [
    { route: "POST /", regex: /router\.post\('\/'/g, schema: 'proxyRequestSchema' }
  ],
  'share.ts': [
    { route: "POST /collection/:id", regex: /router\.post\('\/collection\/:id'/g, schema: 'createShareSchema' }
  ],
  'workspaces.ts': [
    { route: "POST /", regex: /router\.post\('\/'/g, schema: 'createWorkspaceSchema' },
    { route: "PUT /:id", regex: /router\.put\('\/:id'/g, schema: 'updateWorkspaceSchema' }
  ]
};

for (const [file, ops] of Object.entries(map)) {
  const filePath = path.join('server', 'src', 'routes', file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Add imports
  if (!content.includes('import { validate }')) {
    const importName = file.replace('.ts', '');
    let imports = `import { validate } from '../middleware/validate';\n`;
    if (importName !== 'shareProxy') {
       imports += `import * as schemas from '../schemas/${importName}.schemas';\n`;
    }
    // inject after first import
    content = content.replace(/import .*?\n/, match => match + imports);
  }
  
  // Apply schemas
  for (const op of ops) {
    if (op.schema === 'z.any()') {
       content = content.replace(op.regex, (m) => m + `, validate(require('zod').z.any())`);
    } else {
       content = content.replace(op.regex, (m) => m + `, validate(schemas.${op.schema})`);
    }
  }
  
  fs.writeFileSync(filePath, content);
  console.log('Updated ' + file);
}

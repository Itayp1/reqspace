const fs = require('fs');
let code = fs.readFileSync('src/routes/collections.ts', 'utf8');

// Add a simple memory cache for resolveWorkspaceId
code = code.replace(/async function resolveWorkspaceId\(kind: ItemKind, id: string\): Promise<string \| null> \{/, 
`const workspaceIdCache = new Map<string, { wsId: string | null, exp: number }>();
async function resolveWorkspaceId(kind: ItemKind, id: string): Promise<string | null> {
  const cacheKey = kind + ':' + id;
  const cached = workspaceIdCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.wsId;
  
  const resolve = async () => {`);
  
code = code.replace(/  return c \? \(c as any\)\.workspaceId : null;\n\}/, 
`  return c ? (c as any).workspaceId : null;
  };
  const wsId = await resolve();
  workspaceIdCache.set(cacheKey, { wsId, exp: Date.now() + 60000 }); // 60s cache
  if (workspaceIdCache.size > 10000) workspaceIdCache.clear();
  return wsId;
}`);

fs.writeFileSync('src/routes/collections.ts', code);

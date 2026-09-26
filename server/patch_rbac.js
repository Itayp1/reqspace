const fs = require('fs');

let code = fs.readFileSync('src/middleware/rbac.ts', 'utf8');

code = code.replace(/export async function getUserWorkspaceRole\([\s\S]*?\): Promise<UserRole \| null> \{[\s\S]*?return null;\n\}/m, 
`const roleCache = new Map<string, { role: UserRole | null, exp: number }>();
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<UserRole | null> {
  const cacheKey = userId + ':' + workspaceId;
  const cached = roleCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.role;

  const resolve = async () => {
    const workspace = await WorkspaceRepository.findById(workspaceId);
    if (!workspace) return null;

    const member = workspace.members.find(
      (m) => String(m.userId) === String(userId)
    );

    if (member) return member.role as UserRole;
    if (workspace.isPublic) return 'viewer';

    return null;
  };
  
  const role = await resolve();
  roleCache.set(cacheKey, { role, exp: Date.now() + 60000 });
  if (roleCache.size > 10000) roleCache.clear();
  return role;
}`);

fs.writeFileSync('src/middleware/rbac.ts', code);

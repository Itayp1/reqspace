const fs = require('fs');

// 1. UserRepository
let userRepo = fs.readFileSync('src/repositories/UserRepository.ts', 'utf8');
if (!userRepo.includes('decodeCursor')) {
  userRepo = `import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';\n` + userRepo;
}
userRepo = userRepo.replace(/async list\(filter: Record<string, any> = \{\}\): Promise<IUserRecord\[\]> \{[\s\S]*?\},/,
`async list(filter: Record<string, any> = {}, options?: { limit?: number, cursor?: string }): Promise<{ items: IUserRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'createdAt', true); // DESC
    
    const users = await SqlUser.findAll({ 
      where: { ...filter, ...cursorWhere } as any,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: limit + 1
    });

    let nextCursor = null;
    if (users.length > limit) {
      users.pop();
      const lastItem = users[users.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return { items: users.map(sqlToRecord), nextCursor };
  },`);
fs.writeFileSync('src/repositories/UserRepository.ts', userRepo);

// 2. WorkspaceRepository
let wsRepo = fs.readFileSync('src/repositories/WorkspaceRepository.ts', 'utf8');
if (!wsRepo.includes('decodeCursor')) {
  wsRepo = `import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';\n` + wsRepo;
}
wsRepo = wsRepo.replace(/async list\(\): Promise<IWorkspaceRecord\[\]> \{[\s\S]*?\},/,
`async list(options?: { limit?: number, cursor?: string }): Promise<{ items: IWorkspaceRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'createdAt', true); // DESC
    
    const workspaces = await SqlWorkspace.findAll({ 
      where: cursorWhere,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: limit + 1
    });

    let nextCursor = null;
    if (workspaces.length > limit) {
      workspaces.pop();
      const lastItem = workspaces[workspaces.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return { items: workspaces.map(sqlToRecord), nextCursor };
  },`);
fs.writeFileSync('src/repositories/WorkspaceRepository.ts', wsRepo);

// 3. Admin Routes
let adminRoutes = fs.readFileSync('src/routes/admin.ts', 'utf8');
adminRoutes = adminRoutes.replace(/router\.get\('\/users', async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(\{ users, total: users\.length, page: 1, limit: 50 \}\);\n\}\);/,
`router.get('/users', async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const cursor = req.query.cursor as string;
  const result = await UserRepository.list({}, { limit, cursor });
  return res.json({ users: result.items, nextCursor: result.nextCursor });
});`);

adminRoutes = adminRoutes.replace(/router\.get\('\/workspaces', async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(\{ workspaces, total: workspaces\.length, page: 1, limit: 50 \}\);\n\}\);/,
`router.get('/workspaces', async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const cursor = req.query.cursor as string;
  const result = await WorkspaceRepository.list({ limit, cursor });
  return res.json({ workspaces: result.items, nextCursor: result.nextCursor });
});`);
fs.writeFileSync('src/routes/admin.ts', adminRoutes);

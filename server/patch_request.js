const fs = require('fs');

// Patch RequestRepository.ts
let code = fs.readFileSync('src/repositories/RequestRepository.ts', 'utf8');

if (!code.includes('decodeCursor')) {
  code = `import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';\n` + code;
}

code = code.replace(/async findByCollection\(collectionId: string\): Promise<IRequestRecord\[\]> \{[\s\S]*?\},/, 
`async findByCollection(collectionId: string, options?: { folderId?: string | null, limit?: number, cursor?: string }): Promise<{ items: IRequestRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'order', false);
    
    const whereClause: any = { collectionId, ...cursorWhere };
    if (options && options.folderId !== undefined) {
      whereClause.folderId = options.folderId;
    }

    const itemsSql = await SqlRequest.findAll({ 
      where: whereClause, 
      order: [['order', 'ASC'], ['id', 'ASC']], 
      limit: limit + 1 
    });
    
    let nextCursor = null;
    if (itemsSql.length > limit) {
      itemsSql.pop();
      const lastItem = itemsSql[itemsSql.length - 1];
      nextCursor = encodeCursor(lastItem.order, lastItem.id);
    }
    
    return {
      items: itemsSql.map(sqlToRecord),
      nextCursor
    };
  },`);

code = code.replace(/async findByFolder\(folderId: string\): Promise<IRequestRecord\[\]> \{[\s\S]*?\},/, 
`async findByFolder(folderId: string, options?: { limit?: number, cursor?: string }): Promise<{ items: IRequestRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'order', false);
    
    const itemsSql = await SqlRequest.findAll({ 
      where: { folderId, ...cursorWhere }, 
      order: [['order', 'ASC'], ['id', 'ASC']], 
      limit: limit + 1 
    });
    
    let nextCursor = null;
    if (itemsSql.length > limit) {
      itemsSql.pop();
      const lastItem = itemsSql[itemsSql.length - 1];
      nextCursor = encodeCursor(lastItem.order, lastItem.id);
    }
    
    return {
      items: itemsSql.map(sqlToRecord),
      nextCursor
    };
  },`);

// Remove searchInWorkspace (dead code - PERF-4 #7)
code = code.replace(/async searchInWorkspace\([\s\S]*?\},/, '');

fs.writeFileSync('src/repositories/RequestRepository.ts', code);

// Patch routes/collections.ts for requests
let routesCode = fs.readFileSync('src/routes/collections.ts', 'utf8');
routesCode = routesCode.replace(
  /router\.get\('\/collections\/:collectionId\/requests',[\s\S]*?async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(requests\);\n  \}\n\);/,
  `router.get('/collections/:collectionId/requests',
  checkPermission('collection', 'viewer'),
  async (req: AuthRequest, res: Response) => {
    let limit = parseInt(req.query.limit as string, 10);
    if (isNaN(limit)) limit = 50;
    const cursor = req.query.cursor as string;
    
    let result;
    if (req.query.folderId !== undefined) {
      const folderId = req.query.folderId === 'null' ? null : String(req.query.folderId);
      if (folderId === null) {
        result = await RequestRepository.findByCollection(req.params.collectionId, { folderId: null, limit, cursor });
      } else {
        result = await RequestRepository.findByFolder(folderId, { limit, cursor });
      }
    } else {
      result = await RequestRepository.findByCollection(req.params.collectionId, { limit, cursor });
    }
    return res.json(result);
  }
);`
);

fs.writeFileSync('src/routes/collections.ts', routesCode);

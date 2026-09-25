const fs = require('fs');

// Patch FolderRepository.ts
let code = fs.readFileSync('src/repositories/FolderRepository.ts', 'utf8');

if (!code.includes('decodeCursor')) {
  code = `import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';\n` + code;
}

code = code.replace(/async findByCollection\(collectionId: string\): Promise<IFolderRecord\[\]> \{[\s\S]*?\},/, 
`async findByCollection(collectionId: string, options?: { limit?: number, cursor?: string }): Promise<{ items: IFolderRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'order', false);
    
    const itemsSql = await SqlFolder.findAll({ 
      where: { collectionId, ...cursorWhere }, 
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

fs.writeFileSync('src/repositories/FolderRepository.ts', code);

// Patch routes/collections.ts for folders
let routesCode = fs.readFileSync('src/routes/collections.ts', 'utf8');
routesCode = routesCode.replace(
  /router\.get\('\/collections\/:collectionId\/folders',[\s\S]*?async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(folders\);\n  \}\n\);/,
  `router.get('/collections/:collectionId/folders',
  checkPermission('collection', 'viewer'),
  async (req: AuthRequest, res: Response) => {
    let limit = parseInt(req.query.limit as string, 10);
    if (isNaN(limit)) limit = 50;
    const cursor = req.query.cursor as string;
    
    const result = await FolderRepository.findByCollection(req.params.collectionId, { limit, cursor });
    return res.json(result);
  }
);`
);

fs.writeFileSync('src/routes/collections.ts', routesCode);

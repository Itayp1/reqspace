const fs = require('fs');

let code = fs.readFileSync('src/repositories/CollectionRepository.ts', 'utf8');

if (!code.includes('decodeCursor')) {
  code = `import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';\n` + code;
}

code = code.replace(/async findByWorkspace\(workspaceId: string, options\?: \{ limit\?: number \}\): Promise<ICollectionRecord\[\]> \{[\s\S]*?\}\),/m, 
`async findByWorkspace(workspaceId: string, options?: { limit?: number, cursor?: string }): Promise<{ items: ICollectionRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'order', false);
    
    const itemsSql = await SqlCollection.findAll({ 
      where: { workspaceId, ...cursorWhere }, 
      order: [['order', 'ASC'], ['id', 'ASC']], 
      limit: limit + 1 
    });
    
    let nextCursor = null;
    if (itemsSql.length > limit) {
      itemsSql.pop(); // remove the extra item
      const lastItem = itemsSql[itemsSql.length - 1];
      nextCursor = encodeCursor(lastItem.order, lastItem.id);
    }
    
    return {
      items: itemsSql.map(sqlToRecord),
      nextCursor
    };
  },`);

fs.writeFileSync('src/repositories/CollectionRepository.ts', code);

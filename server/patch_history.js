const fs = require('fs');

let code = fs.readFileSync('src/routes/history.ts', 'utf8');

// Add pagination imports
code = `import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';\n` + code;

// 1. Pagination for GET /workspaces/:workspaceId/history
code = code.replace(/router\.get\('\/workspaces\/:workspaceId\/history',[\s\S]*?async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(\{ items: [\s\S]*?, total \}\);\n\}\);/, 
`router.get('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { method, status, limit = '50', cursor } = req.query as Record<string, string>;
  
  const parsedLimit = parseInt(limit, 10);
  const finalLimit = (parsedLimit && parsedLimit <= 200) ? parsedLimit : 200;
  
  const where: any = {
    userId: req.user!._id || req.user!.id,
    workspaceId: req.params.workspaceId,
  };
  if (method) where.method = method.toUpperCase();
  if (status) where.statusCode = +status;

  const cursorObj = decodeCursor(cursor);
  const cursorWhere = getCursorWhere(cursorObj, 'createdAt', true); // DESC

  const items = await SqlHistory.findAll({
    where: { ...where, ...cursorWhere },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: finalLimit + 1,
  });

  let nextCursor = null;
  if (items.length > finalLimit) {
    items.pop();
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
  }

  return res.json({ 
    items: items.map(i => ({...i.toJSON(), requestSnapshot: JSON.parse(i.requestData), responseSnapshot: JSON.parse(i.responseData), _id: i.id})), 
    nextCursor 
  });
});`);

// 2. PERF-4 #4 workspace clear aggregate
code = code.replace(/const removed = await SqlHistory\.findAll\(\{ where: \{ userId: req\.user!._id \|\| req\.user!\.id, workspaceId: req\.params\.workspaceId \} \}\);\n\s*const freed = removed\.reduce\(\(sum, h: any\) => sum \+ Buffer\.byteLength\(JSON\.parse\(h\.responseData\)\?\.body \?\? '', 'utf8'\), 0\);/,
`const { Sequelize } = await import('sequelize');
  const userId = req.user!._id || req.user!.id;
  const workspaceId = req.params.workspaceId;
  const result = await SqlHistory.findAll({
    attributes: [[Sequelize.fn('SUM', Sequelize.fn('LENGTH', Sequelize.col('responseData'))), 'freed']],
    where: { userId, workspaceId },
    raw: true
  });
  const freed = (result[0] as any).freed || 0;`);

// 3. PERF-4 #3 GC loop
code = code.replace(/while \(usedBytes \+ bodySize > maxTotalMB\) \{[\s\S]*?usedBytes \-= oldSize;\n\s*\}/,
`const bytesToFree = usedBytes + bodySize - maxTotalMB;
  if (bytesToFree > 0) {
    let freed = 0;
    let cutoffDate = null;
    let offset = 0;
    while (freed < bytesToFree) {
      const oldest = await SqlHistory.findAll({
        attributes: ['id', 'createdAt', 'responseData'],
        where: { userId },
        order: [['createdAt', 'ASC']],
        limit: 50,
        offset
      });
      if (oldest.length === 0) break;
      for (const row of oldest) {
        freed += Buffer.byteLength(JSON.parse((row as any).responseData)?.body ?? '', 'utf8');
        cutoffDate = row.createdAt;
        if (freed >= bytesToFree) break;
      }
      offset += oldest.length;
    }

    if (cutoffDate) {
      const { Op } = await import('sequelize');
      await SqlHistory.destroy({ where: { userId, createdAt: { [Op.lte]: cutoffDate } } });
      usedBytes -= freed;
    }
  }`);

fs.writeFileSync('src/routes/history.ts', code);

const fs = require('fs');

let code = fs.readFileSync('src/routes/collections.ts', 'utf8');

// Replace resolveWorkspaceId and checkPermission to cache workspaceId per request
// Or better, just rewrite the reorder endpoint.
code = code.replace(/router\.put\('\/reorder',[\s\S]*?export default router;/m,
`router.put('/reorder', validate(schemas.reorderSchema), async (req: AuthRequest, res: Response) => {
  const { type, items } = req.body as {
    type: ItemKind;
    items: Array<{ id: string; order: number }>;
  };

  if (!items?.length) return res.json({ message: 'Reordered' });
  if (items.length > 1000) return res.status(400).json({ message: 'Too many items' });

  const { SqlCollection, SqlFolder, SqlRequest } = await import('../db/sql-models');
  const { Op } = await import('sequelize');
  const itemIds = items.map(i => i.id);

  const workspaceIds = new Set<string>();
  let records: any[] = [];
  if (type === 'collection') {
    records = await SqlCollection.findAll({ attributes: ['id', 'workspaceId'], where: { id: { [Op.in]: itemIds } }, raw: true });
    records.forEach(r => workspaceIds.add(r.workspaceId));
  } else if (type === 'folder') {
    records = await SqlFolder.findAll({ attributes: ['id', 'collectionId'], where: { id: { [Op.in]: itemIds } }, raw: true });
    const colIds = [...new Set(records.map(r => r.collectionId))];
    const cols = await SqlCollection.findAll({ attributes: ['id', 'workspaceId'], where: { id: { [Op.in]: colIds } }, raw: true });
    cols.forEach(c => workspaceIds.add(c.workspaceId));
  } else if (type === 'request') {
    records = await SqlRequest.findAll({ attributes: ['id', 'collectionId'], where: { id: { [Op.in]: itemIds } }, raw: true });
    const colIds = [...new Set(records.map(r => r.collectionId))];
    const cols = await SqlCollection.findAll({ attributes: ['id', 'workspaceId'], where: { id: { [Op.in]: colIds } }, raw: true });
    cols.forEach(c => workspaceIds.add(c.workspaceId));
  } else {
    return res.status(400).json({ message: 'Invalid type' });
  }

  if (workspaceIds.size === 0) return res.status(400).json({ message: 'Could not resolve workspace' });

  if (!req.user!.isSuperAdmin) {
    for (const workspaceId of workspaceIds) {
      const role = await getUserWorkspaceRole(String(req.user!._id), workspaceId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: 'Editor role required in this workspace' });
      }
    }
  }

  // Bulk update
  const modelMap = {
    collection: SqlCollection,
    folder: SqlFolder,
    request: SqlRequest,
  };
  const Model = modelMap[type];
  
  // Create rows for bulkCreate updateOnDuplicate
  const rows = items.map(it => ({ id: it.id, order: it.order }));
  await Model.bulkCreate(rows as any, { updateOnDuplicate: ['order'] });

  for (const workspaceId of workspaceIds) {
    emitToWorkspace(workspaceId, 'workspace:reordered', undefined);
  }
  return res.json({ message: 'Reordered' });
});

export default router;`);

// To fix PERF-4 #2 (resolveWorkspaceId N+1 during mutating requests, etc), 
// wait, checkPermission is only called ONCE per HTTP request because it's a middleware!
// The "2 sequential reads on every mutating call" refers to `FolderRepository.findById` then `CollectionRepository.findById`.
// We can just use a JOIN / Include or leave it. Actually, the prompt says "Fix: Denormalise workspaceId onto folders and requests, or cache (PERF-5)".
// I will just add a tiny cache in resolveWorkspaceId to avoid repeated reads if it's called multiple times per request, 
// OR I can just use SqlFolder.findByPk(id, { include: [...] }).
// Let's rewrite resolveWorkspaceId to do 1 query instead of 2.

code = code.replace(/async function resolveWorkspaceId\(kind: ItemKind, id: string\): Promise<string \| null> \{[\s\S]*?\}\n/m, 
`async function resolveWorkspaceId(kind: ItemKind, id: string): Promise<string | null> {
  const { SqlCollection, SqlFolder, SqlRequest } = await import('../db/sql-models');
  if (kind === 'collection') {
    const c = await SqlCollection.findByPk(id, { attributes: ['workspaceId'], raw: true });
    return c ? (c as any).workspaceId : null;
  }
  if (kind === 'folder') {
    const f = await SqlFolder.findByPk(id, { attributes: ['collectionId'], raw: true });
    if (!f) return null;
    const c = await SqlCollection.findByPk((f as any).collectionId, { attributes: ['workspaceId'], raw: true });
    return c ? (c as any).workspaceId : null;
  }
  const r = await SqlRequest.findByPk(id, { attributes: ['collectionId'], raw: true });
  if (!r) return null;
  const c = await SqlCollection.findByPk((r as any).collectionId, { attributes: ['workspaceId'], raw: true });
  return c ? (c as any).workspaceId : null;
}
`);

fs.writeFileSync('src/routes/collections.ts', code);

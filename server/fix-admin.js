const fs = require('fs');
let c = fs.readFileSync('server/src/routes/admin.ts', 'utf8');

const regexExport = /router\.get\('\/export\/:workspaceId', async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(dump\);\r?\n\}\);/;

const replacementExport = `router.get('/export/:workspaceId', async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const workspace = await WorkspaceRepository.findById(workspaceId);
  const collections = await SqlCollection.findAll({ where: { workspaceId }, raw: true });
  const collectionIds = collections.map(c => c.id);
  const folders = collectionIds.length > 0 ? await SqlFolder.findAll({ where: { collectionId: collectionIds }, raw: true }) : [];
  const requests = collectionIds.length > 0 ? await SqlRequest.findAll({ where: { collectionId: collectionIds }, raw: true }) : [];
  const environments = await SqlEnvironment.findAll({ where: { workspaceId }, raw: true });

  const dump = { workspace, collections, folders, requests, environments };
  await logAudit(req.user!._id as any, 'admin.export', { ip: req.ip, targetId: workspaceId as any });
  return res.json(dump);
});`;

const regexImport = /router\.post\('\/import\/:workspaceId', validate\(schemas\.importDumpSchema\), async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(\{ message: 'Import successful' \}\);\r?\n\}\);/;

const replacementImport = `router.post('/import/:workspaceId', validate(schemas.importDumpSchema), async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const dump = req.body;
  const crypto = await import('crypto');
  const uuidv4 = crypto.randomUUID;

  const idMap = new Map<string, string>();
  
  if (dump.collections) {
    const mapped = dump.collections.map((c: any) => {
      const newId = uuidv4();
      idMap.set(c.id, newId);
      return { ...c, workspaceId, id: newId };
    });
    await SqlCollection.bulkCreate(mapped);
  }
  
  if (dump.folders) {
    const mapped = dump.folders.map((f: any) => {
      const newId = uuidv4();
      idMap.set(f.id, newId);
      return { 
        ...f, 
        id: newId,
        collectionId: idMap.get(f.collectionId) || f.collectionId,
        parentFolderId: f.parentFolderId ? (idMap.get(f.parentFolderId) || f.parentFolderId) : null
      };
    });
    await SqlFolder.bulkCreate(mapped);
  }
  
  if (dump.requests) {
    const mapped = dump.requests.map((r: any) => {
      const newId = uuidv4();
      idMap.set(r.id, newId);
      return { 
        ...r, 
        id: newId,
        collectionId: idMap.get(r.collectionId) || r.collectionId,
        folderId: r.folderId ? (idMap.get(r.folderId) || r.folderId) : null
      };
    });
    await SqlRequest.bulkCreate(mapped);
  }
  
  if (dump.environments) {
    const mapped = dump.environments.map((e: any) => {
      const newId = uuidv4();
      return { ...e, workspaceId, id: newId };
    });
    await SqlEnvironment.bulkCreate(mapped);
  }

  await logAudit(req.user!._id as any, 'admin.import', { ip: req.ip, targetId: workspaceId as any });
  return res.json({ message: 'Import successful' });
});`;

c = c.replace(regexExport, replacementExport);
c = c.replace(regexImport, replacementImport);
fs.writeFileSync('server/src/routes/admin.ts', c);
console.log('done');

const fs = require('fs');
let c = fs.readFileSync('server/src/routes/admin.ts', 'utf8');

c = c.replace(/import \{ dbDownBody \} from '\.\.\/utils\/dbGate';/g, "import { dbDownBody } from '../utils/dbGate';\nimport { sq } from '../db/connect';");

const regexImport = /router\.post\('\/import\/:workspaceId', validate\(schemas\.importDumpSchema\), async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(\{ message: 'Import successful' \}\);\r?\n\}\);/;

const replacementImport = `router.post('/import/:workspaceId', validate(schemas.importDumpSchema), async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const dump = req.body;
  const crypto = await import('crypto');
  const uuidv4 = crypto.randomUUID;

  const idMap = new Map<string, string>();
  
  const t = await sq.transaction();
  try {
    if (dump.collections) {
      const mapped = dump.collections.map((c: any) => {
        const newId = uuidv4();
        idMap.set(c.id, newId);
        return { ...c, workspaceId, id: newId };
      });
      await SqlCollection.bulkCreate(mapped, { transaction: t });
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
      await SqlFolder.bulkCreate(mapped, { transaction: t });
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
      await SqlRequest.bulkCreate(mapped, { transaction: t });
    }
    
    if (dump.environments) {
      const mapped = dump.environments.map((e: any) => {
        const newId = uuidv4();
        return { ...e, workspaceId, id: newId };
      });
      await SqlEnvironment.bulkCreate(mapped, { transaction: t });
    }
    
    await t.commit();
  } catch (err) {
    await t.rollback();
    return res.status(400).json({ message: 'Import failed due to constraints', error: String(err) });
  }

  await logAudit(req.user!._id as any, 'admin.import', { ip: req.ip, targetId: workspaceId as any });
  return res.json({ message: 'Import successful' });
});`;

c = c.replace(regexImport, replacementImport);
if (!c.includes('import { sq } from \'../db/connect\';')) {
  c = "import { sq } from '../db/connect';\n" + c;
}
fs.writeFileSync('server/src/routes/admin.ts', c);
console.log('done tx');

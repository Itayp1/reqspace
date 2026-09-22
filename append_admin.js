const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server/src/routes/admin.ts');
let content = fs.readFileSync(filePath, 'utf8');

// We need to import more models at the top
if (!content.includes('import { WorkspaceRepository }')) {
  content = content.replace(/import \{ SystemConfigRepository \} from '\.\.\/repositories\/SystemConfigRepository';/, 
    "import { SystemConfigRepository } from '../repositories/SystemConfigRepository';\nimport { WorkspaceRepository } from '../repositories/WorkspaceRepository';\nimport { Collection } from '../models/Collection';\nimport { Folder } from '../models/Folder';\nimport { Request } from '../models/Request';\nimport { Environment } from '../models/Environment';\nimport { GlobalVariable } from '../models/GlobalVariable';");
}

const routes = \
// ?? GET /api/admin/export/:workspaceId ??????????????????????????????
router.get('/export/:workspaceId', async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId;
    const workspace = await WorkspaceRepository.findById(workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const collections = await Collection.find({ workspaceId }).lean();
    const folders = await Folder.find({ workspaceId }).lean();
    const requests = await Request.find({ workspaceId }).lean();
    const environments = await Environment.find({ workspaceId }).lean();
    const globals = await GlobalVariable.find({ workspaceId }).lean();
    const config = await SystemConfigRepository.getConfig();

    const dump = {
      workspace,
      collections,
      folders,
      requests,
      environments,
      globals,
      config
    };

    await logAudit(req.user!._id as any, 'admin.export', { ip: req.ip, targetId: workspaceId });
    return res.json(dump);
  } catch(err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ?? POST /api/admin/import/:workspaceId ?????????????????????????????
router.post('/import/:workspaceId', async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId;
    const dump = req.body;
    
    // In a real scenario we should validate and insert. 
    // Since this is a dump, we can insert collections, folders, requests, environments, globals.
    if (dump.collections) await Collection.insertMany(dump.collections.map((c: any) => ({ ...c, workspaceId, _id: undefined })));
    if (dump.folders) await Folder.insertMany(dump.folders.map((f: any) => ({ ...f, workspaceId, _id: undefined })));
    if (dump.requests) await Request.insertMany(dump.requests.map((r: any) => ({ ...r, workspaceId, _id: undefined })));
    if (dump.environments) await Environment.insertMany(dump.environments.map((e: any) => ({ ...e, workspaceId, _id: undefined })));
    if (dump.globals) await GlobalVariable.insertMany(dump.globals.map((g: any) => ({ ...g, workspaceId, _id: undefined })));

    if (dump.config) {
      await SystemConfigRepository.updateConfig(dump.config);
    }

    await logAudit(req.user!._id as any, 'admin.import', { ip: req.ip, targetId: workspaceId });
    return res.json({ message: 'Import successful' });
  } catch(err: any) {
    return res.status(500).json({ message: err.message });
  }
});
\;

content = content.replace('export default router;', routes + '\nexport default router;');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Admin routes appended.');

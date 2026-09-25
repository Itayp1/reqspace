import { validate } from '../middleware/validate';
import * as schemas from '../schemas/admin.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireSuperAdmin } from '../middleware/auth';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { logAudit } from '../repositories/AuditLogRepository';
import { SqlAuditLog, SqlCollection, SqlFolder, SqlRequest, SqlEnvironment } from '../db/sql-models';

const router = Router();
router.use(authenticate, requireSuperAdmin);

router.get('/users', async (req: AuthRequest, res: Response) => {
  const users = await UserRepository.list();
  return res.json({ users, total: users.length, page: 1, limit: 50 });
});

router.get('/workspaces', async (req: AuthRequest, res: Response) => {
  const workspaces = await WorkspaceRepository.list();
  return res.json({ workspaces, total: workspaces.length, page: 1, limit: 50 });
});

router.get('/logs', async (req: AuthRequest, res: Response) => {
  const logs = await SqlAuditLog.findAll({ limit: 50, order: [['createdAt', 'DESC']] });
  return res.json({ logs, total: logs.length });
});

const SECRET_MASK = '��������';
function maskConfigSecrets(config: any) {
  if (!config) return config;
  const masked = JSON.parse(JSON.stringify(config));
  if (masked.auth?.smtp?.pass) masked.auth.smtp.pass = SECRET_MASK;
  if (masked.auth?.googleOAuth?.clientSecret) masked.auth.googleOAuth.clientSecret = SECRET_MASK;
  if (masked.proxy?.password) masked.proxy.password = SECRET_MASK;
  return masked;
}

router.get('/config', async (_req: AuthRequest, res: Response) => {
  const config = await SystemConfigRepository.getConfig();
  return res.json(maskConfigSecrets(config));
});

router.put('/config', validate(schemas.updateConfigSchema), async (req: AuthRequest, res: Response) => {
  const update = JSON.parse(JSON.stringify(req.body));
  if (update.auth?.smtp?.pass === SECRET_MASK) delete update.auth.smtp.pass;
  if (update.auth?.googleOAuth?.clientSecret === SECRET_MASK) delete update.auth.googleOAuth.clientSecret;
  if (update.proxy?.password === SECRET_MASK) delete update.proxy.password;

  const config = await SystemConfigRepository.updateConfig(update);
  await logAudit(req.user!._id as any, 'admin.config.update', {
    ip: req.ip, details: { fields: Object.keys(req.body) },
  });
  return res.json(maskConfigSecrets(config));
});

router.get('/export/:workspaceId', async (req: AuthRequest, res: Response) => {
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
});

router.post('/import/:workspaceId', validate(schemas.importDumpSchema), async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const dump = req.body;
  const crypto = await import('crypto');
  const uuidv4 = crypto.randomUUID;

  const idMap = new Map<string, string>();
  
  const t = await SqlCollection.sequelize!.transaction();
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
      // Check for dangling parentFolderIds
      for (const f of mapped) {
        if (f.parentFolderId && !mapped.find((x: any) => x.id === f.parentFolderId)) {
          throw new Error('Dangling parentFolderId');
        }
      }
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
});

export default router;

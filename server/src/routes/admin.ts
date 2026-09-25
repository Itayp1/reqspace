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

router.put('/config', async (req: AuthRequest, res: Response) => {
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
  const folders = await SqlFolder.findAll({ where: { workspaceId }, raw: true });
  const requests = await SqlRequest.findAll({ where: { workspaceId }, raw: true });
  const environments = await SqlEnvironment.findAll({ where: { workspaceId }, raw: true });

  const dump = { workspace, collections, folders, requests, environments };
  await logAudit(req.user!._id as any, 'admin.export', { ip: req.ip, targetId: workspaceId as any });
  return res.json(dump);
});

router.post('/import/:workspaceId', async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const dump = req.body;
  if (dump.collections) await SqlCollection.bulkCreate(dump.collections.map((c: any) => ({ ...c, workspaceId, id: undefined })));
  if (dump.folders) await SqlFolder.bulkCreate(dump.folders.map((f: any) => ({ ...f, workspaceId, id: undefined })));
  if (dump.requests) await SqlRequest.bulkCreate(dump.requests.map((r: any) => ({ ...r, workspaceId, id: undefined })));
  if (dump.environments) await SqlEnvironment.bulkCreate(dump.environments.map((e: any) => ({ ...e, workspaceId, id: undefined })));

  await logAudit(req.user!._id as any, 'admin.import', { ip: req.ip, targetId: workspaceId as any });
  return res.json({ message: 'Import successful' });
});

export default router;

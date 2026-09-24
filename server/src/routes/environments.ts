import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole, requireWorkspaceRole } from '../middleware/rbac';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { emitToWorkspace } from '../socketUtils';

const router = Router();

const WRITABLE = ['name', 'variables', 'order', 'isGlobal'] as const;

function checkEnvPermission(minRole: 'viewer' | 'editor') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.isSuperAdmin) {
      const item = await EnvironmentRepository.findById(req.params.id);
      if (item) req.params.workspaceId = item.workspaceId;
      return next();
    }
    try {
      const item = await EnvironmentRepository.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Environment not found' });
      req.params.workspaceId = String(item.workspaceId);
      return requireWorkspaceRole(minRole)(req, res, next);
    } catch (e) { next(e); }
  };
}

async function assertEditor(user: any, workspaceId: string, res: Response): Promise<boolean> {
  if (user?.isSuperAdmin) return true;
  const role = await getUserWorkspaceRole(String(user._id), workspaceId);
  if (!role || role === 'viewer') {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

router.use(authenticate);

router.get('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 0;
    const envs = await EnvironmentRepository.listForWorkspace(req.params.workspaceId);
    if (!limit) return res.json(envs);
    const cursor = String(req.query.cursor || '');
    const start = cursor ? envs.findIndex((e) => e._id === cursor) + 1 : 0;
    const items = envs.slice(Math.max(0, start), start + limit);
    const next = start + limit < envs.length ? items[items.length - 1]?._id : null;
    return res.json({ items, nextCursor: next });
  }
);

router.post('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const { name, isGlobal, variables } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const env = await EnvironmentRepository.create({
      workspaceId: req.params.workspaceId,
      name,
      isGlobal: !!isGlobal,
      variables: variables ?? [],
      createdBy: String(req.user!._id),
    });
    emitToWorkspace(req.params.workspaceId, 'environment:created', env);
    return res.status(201).json(env);
  }
);

router.put('/environments/reorder', async (req: AuthRequest, res: Response) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) return res.status(400).json({ message: 'Invalid items array' });
  if (items.length === 0) return res.json({ success: true });

  const sample = await EnvironmentRepository.findById(items[0].id);
  if (!sample) return res.status(404).json({ message: 'Environment not found' });
  if (!(await assertEditor(req.user, sample.workspaceId, res))) return;

  for (const item of items) {
    if (typeof item.order === 'number') await EnvironmentRepository.updateOrder(item.id, item.order);
  }
  const refreshed = await EnvironmentRepository.listForWorkspace(sample.workspaceId);
  emitToWorkspace(sample.workspaceId, 'environment:updated', refreshed);
  return res.json({ success: true });
});

router.get('/environments/:id', checkEnvPermission('viewer'), async (req: AuthRequest, res: Response) => {
  const env = await EnvironmentRepository.findById(req.params.id);
  if (!env) return res.status(404).json({ message: 'Environment not found' });
  return res.json(env);
});

router.put('/environments/:id', checkEnvPermission('editor'), async (req: AuthRequest, res: Response) => {
  const patch: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const env = await EnvironmentRepository.update(req.params.id, patch as any);
  if (!env) return res.status(404).json({ message: 'Environment not found' });
  emitToWorkspace(req.params.workspaceId || env.workspaceId, 'environment:updated', env);
  return res.json(env);
});

router.delete('/environments/:id', checkEnvPermission('editor'), async (req: AuthRequest, res: Response) => {
  const existing = await EnvironmentRepository.findById(req.params.id);
  await EnvironmentRepository.delete(req.params.id);
  emitToWorkspace(req.params.workspaceId || existing?.workspaceId, 'environment:deleted', req.params.id);
  return res.json({ message: 'Environment deleted' });
});

router.post('/environments/:id/duplicate', checkEnvPermission('viewer'), async (req: AuthRequest, res: Response) => {
  const env = await EnvironmentRepository.findById(req.params.id);
  if (!env) return res.status(404).json({ message: 'Environment not found' });

  const targetWorkspaceId = req.body.workspaceId || env.workspaceId;
  if (req.body.workspaceId && req.body.workspaceId !== String(env.workspaceId)) {
    const targetWs = await WorkspaceRepository.findById(targetWorkspaceId);
    if (!targetWs) return res.status(404).json({ message: 'Target workspace not found' });
    if (!(await assertEditor(req.user, targetWorkspaceId, res))) return;
  }

  const duplicate = await EnvironmentRepository.create({
    workspaceId: targetWorkspaceId,
    name: `${env.name} (copy)`,
    variables: env.variables,
    order: env.order,
    isGlobal: false,
    createdBy: String(req.user!._id),
  });
  emitToWorkspace(targetWorkspaceId, 'environment:created', duplicate);
  return res.status(201).json(duplicate);
});

export default router;

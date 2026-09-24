import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { emitToWorkspace } from '../socketUtils';

const router = Router();

function canEdit(role: string | undefined, isSuperAdmin: boolean | undefined): boolean {
  if (isSuperAdmin) return true;
  return !!role && role !== 'viewer';
}

function checkEnvPermission(minRole: 'viewer' | 'editor') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.isSuperAdmin) return next();
    try {
      const item = await EnvironmentRepository.findById(req.params.id as string);
      if (!item) return res.status(404).json({ message: 'Environment not found' });
      req.params.workspaceId = String(item.workspaceId);
      return requireWorkspaceRole(minRole)(req, res, next);
    } catch (e) { next(e); }
  };
}

router.use(authenticate);

router.get('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const envs = await EnvironmentRepository.findByWorkspace(req.params.workspaceId as string);
    return res.json(envs);
  }
);

router.post('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const { name, isGlobal, variables } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });

    const env = await EnvironmentRepository.create({
      workspaceId: req.params.workspaceId as string,
      name,
      isGlobal: isGlobal ?? false,
      variables: variables ?? [],
      createdBy: String(req.user!._id),
    });
    emitToWorkspace(req.params.workspaceId as string, 'environment:created', env);
    return res.status(201).json(env);
  }
);

router.put('/environments/reorder', async (req: AuthRequest, res: Response) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) return res.status(400).json({ message: 'Invalid items array' });
  if (items.length === 0) return res.json({ success: true });

  const sample = await EnvironmentRepository.findById(items[0].id);
  if (!sample) return res.status(404).json({ message: 'Environment not found' });
  const workspaceId = String(sample.workspaceId);

  if (!req.user?.isSuperAdmin) {
    const ws = await WorkspaceRepository.findById(workspaceId);
    if (!ws) return res.status(404).json({ message: 'Workspace not found' });
    const member = ws.members.find(m => String(m.userId) === String(req.user!._id));
    if (!canEdit(member?.role, false)) return res.status(403).json({ message: 'Forbidden' });
  }

  for (const item of items) {
    await EnvironmentRepository.update(item.id, { order: item.order });
  }
  emitToWorkspace(workspaceId, 'environment:updated', { items });
  return res.json({ success: true });
});

router.get('/environments/:id', checkEnvPermission('viewer'), async (req: AuthRequest, res: Response) => {
  const env = await EnvironmentRepository.findById(req.params.id as string);
  if (!env) return res.status(404).json({ message: 'Environment not found' });
  return res.json(env);
});

router.put('/environments/:id', checkEnvPermission('editor'), async (req: AuthRequest, res: Response) => {
  const { name, variables, order, isGlobal } = req.body ?? {};
  const patch: { name?: string; variables?: any; order?: number; isGlobal?: boolean } = {};
  if (name !== undefined) patch.name = name;
  if (variables !== undefined) patch.variables = variables;
  if (order !== undefined) patch.order = order;
  if (isGlobal !== undefined) patch.isGlobal = isGlobal;
  const env = await EnvironmentRepository.update(req.params.id as string, patch);
  if (!env) return res.status(404).json({ message: 'Environment not found' });
  emitToWorkspace(req.params.workspaceId as string, 'environment:updated', env);
  return res.json(env);
});

router.delete('/environments/:id', checkEnvPermission('editor'), async (req: AuthRequest, res: Response) => {
  await EnvironmentRepository.delete(req.params.id as string);
  emitToWorkspace(req.params.workspaceId as string, 'environment:deleted', req.params.id);
  return res.json({ message: 'Environment deleted' });
});

router.post('/environments/:id/duplicate', checkEnvPermission('viewer'), async (req: AuthRequest, res: Response) => {
  const env = await EnvironmentRepository.findById(req.params.id as string);
  if (!env) return res.status(404).json({ message: 'Environment not found' });

  const targetWorkspaceId = req.body.workspaceId || env.workspaceId;
  if (req.body.workspaceId && req.body.workspaceId !== String(env.workspaceId)) {
    const targetWs = await WorkspaceRepository.findById(targetWorkspaceId);
    if (!targetWs) return res.status(404).json({ message: 'Target workspace not found' });
    const member = targetWs.members.find(m => String(m.userId) === String(req.user!._id));
    if (!member && !req.user!.isSuperAdmin) {
      return res.status(403).json({ message: 'No access to target workspace' });
    }
    if (member && !canEdit(member.role, false)) {
      return res.status(403).json({ message: 'Viewers cannot create environments in the target workspace' });
    }
  }

  const duplicate = await EnvironmentRepository.create({
    workspaceId: targetWorkspaceId,
    name: `${env.name} (copy)`,
    isGlobal: env.isGlobal,
    order: env.order,
    variables: env.variables,
    createdBy: String(req.user!._id),
  });
  emitToWorkspace(targetWorkspaceId, 'environment:created', duplicate);
  return res.status(201).json(duplicate);
});

export default router;

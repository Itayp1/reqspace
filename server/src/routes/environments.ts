import { logAudit } from '../repositories/AuditLogRepository';
import { validate } from '../middleware/validate';
import * as schemas from '../schemas/environments.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole, getUserWorkspaceRole } from '../middleware/rbac';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { isValidId } from '../utils/ids';
import { NextFunction } from "express";
import { emitToWorkspace } from '../socketUtils';
const router = Router();

function checkEnvPermission(minRole: 'viewer' | 'editor') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const item = await EnvironmentRepository.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Environment not found' });
      req.params.workspaceId = String(item.workspaceId);
      if (req.user?.isSuperAdmin) return next();
      return requireWorkspaceRole(minRole)(req, res, next);
    } catch(e) { next(e); }
  };
}

// Secret variables keep their values for editors/owners only; read-only members
// still see the variable (key, flags) but not its value.
const SECRET_VALUE_FIELDS = ['value', 'initialValue', 'currentValue'];
function maskSecretsForViewer<T extends { variables?: any }>(env: T, req: AuthRequest): T {
  const role = (req as AuthRequest & { workspaceRole?: string }).workspaceRole;
  if (role !== 'viewer' || !Array.isArray(env.variables)) return env;
  const variables = env.variables.map((v: any) => {
    if (!v || !(v.isSecret === true || v.type === 'secret')) return v;
    const masked = { ...v };
    for (const f of SECRET_VALUE_FIELDS) if (f in masked) masked[f] = '';
    return masked;
  });
  return { ...env, variables };
}

// "X (Copy)", then "X (Copy 2)", ... so repeated copies into one workspace stay distinguishable.
async function uniqueCopyName(workspaceId: string, baseName: string): Promise<string> {
  const taken = new Set((await EnvironmentRepository.findByWorkspace(workspaceId)).map((e) => e.name));
  let name = `${baseName} (Copy)`;
  for (let n = 2; taken.has(name); n++) name = `${baseName} (Copy ${n})`;
  return name;
}

router.use(authenticate);

router.get('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const envs = await EnvironmentRepository.findByWorkspace(req.params.workspaceId);
    return res.json(envs.map((e) => maskSecretsForViewer(e, req)));
  }
);

// The global ("Globals (Common)") environment lives in its own table, one
// row per workspace — lazily created on first read so the client always has
// something to show/edit rather than needing a separate "create" step.
router.get('/workspaces/:workspaceId/global-environment',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const existing = await EnvironmentRepository.findGlobal(req.params.workspaceId);
    const global = existing || await EnvironmentRepository.upsertGlobal(req.params.workspaceId, []);
    return res.json(maskSecretsForViewer(global, req));
  }
);

router.put('/workspaces/:workspaceId/global-environment', validate(schemas.updateGlobalEnvironmentSchema),
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const global = await EnvironmentRepository.upsertGlobal(req.params.workspaceId, req.body.variables);
    logAudit(String(req.user!._id), 'environment.global.update', { targetType: 'Workspace', targetId: req.params.workspaceId });
    emitToWorkspace(req.params.workspaceId, 'environment:updated', { ...global, isGlobal: true });
    return res.json(global);
  }
);

router.post('/workspaces/:workspaceId/environments', validate(schemas.createEnvironmentSchema),
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const env = await EnvironmentRepository.create({
      ...req.body,
      workspaceId: req.params.workspaceId,
      createdBy: req.user!._id
    });
    logAudit(String(req.user!._id), 'environment.create', { targetType: 'Workspace', targetId: req.params.workspaceId, details: { environmentId: env._id, name: env.name } });
    emitToWorkspace(req.params.workspaceId, 'environment:created', env);
    return res.status(201).json(env);
  }
);

router.put('/environments/:id', validate(schemas.updateEnvironmentSchema),
  checkEnvPermission('editor'),
  async (req: AuthRequest, res: Response) => {
    const env = await EnvironmentRepository.update(req.params.id, req.body);
    if (!env) return res.status(404).json({ message: 'Not found' });
    logAudit(String(req.user!._id), 'environment.update', { targetType: 'Workspace', targetId: req.params.workspaceId, details: { environmentId: req.params.id, name: env.name } });
    emitToWorkspace(req.params.workspaceId, 'environment:updated', env);
    return res.json(env);
  }
);

// Copies an environment — into its own workspace ("Duplicate") or into another
// one the caller can edit ("Copy to Workspace"). The sidebar has always called
// this; the route itself was missing, so both actions 404'd.
router.post('/environments/:id/duplicate', validate(schemas.duplicateEnvironmentSchema),
  checkEnvPermission('viewer'),
  async (req: AuthRequest, res: Response) => {
    const source = await EnvironmentRepository.findById(req.params.id);
    if (!source) return res.status(404).json({ message: 'Environment not found' });
    const targetWorkspaceId: string = req.body.workspaceId || source.workspaceId;
    if (!isValidId(targetWorkspaceId)) return res.status(400).json({ message: 'Invalid workspace ID' });
    if (!req.user!.isSuperAdmin) {
      const role = await getUserWorkspaceRole(String(req.user!._id), targetWorkspaceId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: 'Editor role required in the target workspace' });
      }
    }
    const env = await EnvironmentRepository.create({
      workspaceId: targetWorkspaceId,
      name: await uniqueCopyName(targetWorkspaceId, source.name),
      variables: maskSecretsForViewer(source, req).variables || [],
      createdBy: String(req.user!._id),
    });
    emitToWorkspace(targetWorkspaceId, 'environment:created', env);
    return res.status(201).json(env);
  }
);

router.delete('/environments/:id',
  checkEnvPermission('editor'),
  async (req: AuthRequest, res: Response) => {
    await EnvironmentRepository.delete(req.params.id);
    logAudit(String(req.user!._id), 'environment.delete', { targetType: 'Workspace', targetId: req.params.workspaceId, details: { environmentId: req.params.id } });
    emitToWorkspace(req.params.workspaceId, 'environment:deleted', req.params.id);
    return res.status(204).end();
  }
);

export default router;

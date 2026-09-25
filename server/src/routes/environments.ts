import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { NextFunction } from "express";
import { emitToWorkspace } from '../socketUtils';
const router = Router();

function checkEnvPermission(minRole: 'viewer' | 'editor') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.isSuperAdmin) return next();
    try {
      const item = await EnvironmentRepository.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Environment not found' });
      req.params.workspaceId = String(item.workspaceId);
      return requireWorkspaceRole(minRole)(req, res, next);
    } catch(e) { next(e); }
  };
}

router.use(authenticate);

router.get('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const envs = await EnvironmentRepository.findByWorkspace(req.params.workspaceId);
    return res.json(envs);
  }
);

router.post('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const env = await EnvironmentRepository.create({
      ...req.body,
      workspaceId: req.params.workspaceId,
      createdBy: req.user!._id
    });
    emitToWorkspace(req.params.workspaceId, 'environment-created', env);
    return res.status(201).json(env);
  }
);

router.put('/environments/:id',
  checkEnvPermission('editor'),
  async (req: AuthRequest, res: Response) => {
    const env = await EnvironmentRepository.update(req.params.id, req.body);
    if (!env) return res.status(404).json({ message: 'Not found' });
    emitToWorkspace(req.params.workspaceId, 'environment-updated', env);
    return res.json(env);
  }
);

router.delete('/environments/:id',
  checkEnvPermission('editor'),
  async (req: AuthRequest, res: Response) => {
    await EnvironmentRepository.delete(req.params.id);
    emitToWorkspace(req.params.workspaceId, 'environment-deleted', req.params.id);
    return res.status(204).end();
  }
);

export default router;

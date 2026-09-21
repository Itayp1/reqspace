import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { Environment } from '../models/Environment';

import { NextFunction } from "express";
const router = Router();

async function checkEnvPermission(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.isSuperAdmin) return next();
  try {
    const item = await Environment.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Environment not found' });
    req.params.workspaceId = String(item.workspaceId);
    return requireWorkspaceRole('editor')(req, res, next);
  } catch(e) { next(e); }
}

router.use(authenticate);

// ── GET /api/workspaces/:workspaceId/environments ───────────────────────────
router.get('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const envs = await Environment.find({
      workspaceId: req.params.workspaceId,
    }).sort({ isGlobal: -1, createdAt: 1 }).lean();
    return res.json(envs);
  }
);

// ── POST /api/workspaces/:workspaceId/environments ──────────────────────────
router.post('/workspaces/:workspaceId/environments',
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const { name, isGlobal, variables } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });

    const env = await Environment.create({
      workspaceId: req.params.workspaceId,
      name, isGlobal: isGlobal ?? false,
      variables: variables ?? [],
      createdBy: req.user!._id,
    });
    return res.status(201).json(env);
  }
);

// ── GET /api/environments/:id ───────────────────────────────────────────────
router.get('/environments/:id', async (req: AuthRequest, res: Response) => {
  const env = await Environment.findById(req.params.id).lean();
  if (!env) return res.status(404).json({ message: 'Environment not found' });
  return res.json(env);
});

// ── PUT /api/environments/:id ───────────────────────────────────────────────
router.put('/environments/:id', checkEnvPermission, async (req: AuthRequest, res: Response) => {
  const env = await Environment.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!env) return res.status(404).json({ message: 'Environment not found' });
  return res.json(env);
});

// ── DELETE /api/environments/:id ────────────────────────────────────────────
router.delete('/environments/:id', checkEnvPermission, async (req: AuthRequest, res: Response) => {
  await Environment.findByIdAndDelete(req.params.id);
  return res.json({ message: 'Environment deleted' });
});

// ── POST /api/environments/:id/duplicate ────────────────────────────────────
router.post('/environments/:id/duplicate', checkEnvPermission, async (req: AuthRequest, res: Response) => {
  const env = await Environment.findById(req.params.id).lean();
  if (!env) return res.status(404).json({ message: 'Environment not found' });

  // If a target workspace is provided, verify the user has access to it
  const targetWorkspaceId = req.body.workspaceId || env.workspaceId;
  if (req.body.workspaceId && req.body.workspaceId !== String(env.workspaceId)) {
    const Workspace = require('../models/Workspace').Workspace;
    const targetWs = await Workspace.findById(targetWorkspaceId);
    if (!targetWs) return res.status(404).json({ message: 'Target workspace not found' });
    const member = targetWs.members.find((m: any) => String(m.userId) === String(req.user!._id));
    if (!member && !req.user!.isSuperAdmin) {
      return res.status(403).json({ message: 'No access to target workspace' });
    }
    if (member && member.role === 'viewer') {
      return res.status(403).json({ message: 'Viewers cannot create environments in the target workspace' });
    }
  }

  const { _id, ...data } = env;
  const duplicate = await Environment.create({
    ...data,
    workspaceId: targetWorkspaceId,
    name: `${env.name} (copy)`,
    createdBy: req.user!._id,
  });
  return res.status(201).json(duplicate);
});

export default router;

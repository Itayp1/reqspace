import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { Collection } from '../models/Collection';
import { Folder } from '../models/Folder';
import { Request as ApiRequest } from '../models/Request';
import { logAudit } from '../repositories/AuditLogRepository';
import mongoose from 'mongoose';

import { NextFunction } from "express";
import { UserRole } from "../models/User";
const router = Router();

async function checkPermissionByItem(req: AuthRequest, res: Response, next: NextFunction, Model: any, minRole: UserRole) {
  if (req.user?.isSuperAdmin) return next();
  try {
    const item = await Model.findById(req.params.id || req.params.collectionId);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    let workspaceId = item.workspaceId;
    if (!workspaceId && item.collectionId) {
      const coll = await Collection.findById(item.collectionId);
      if (coll) workspaceId = coll.workspaceId;
    }
    if (!workspaceId) return res.status(400).json({ message: 'No workspace attached' });
    req.params.workspaceId = String(workspaceId);
    return requireWorkspaceRole(minRole)(req, res, next);
  } catch(e) { next(e); }
}

router.use(authenticate);

// ── Collections ─────────────────────────────────────────────────────────────

router.get('/workspaces/:workspaceId/collections',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const collections = await Collection.find({ workspaceId: req.params.workspaceId })
      .sort({ order: 1 }).lean();
    return res.json(collections);
  }
);

router.post('/workspaces/:workspaceId/collections',
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const { name, description, variables, preRequestScript, testScript } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });

    const count = await Collection.countDocuments({ workspaceId: req.params.workspaceId });
    const collection = await Collection.create({
      workspaceId: req.params.workspaceId,
      name, description, variables, preRequestScript, testScript,
      order: count,
      createdBy: req.user!._id,
    });
    return res.status(201).json(collection);
  }
);

router.put('/collections/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Collection, 'editor'), async (req: AuthRequest, res: Response) => {
    const collection = await Collection.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.json(collection);
  }
);

router.delete('/collections/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Collection, 'editor'), async (req: AuthRequest, res: Response) => {
    await Folder.deleteMany({ collectionId: req.params.id });
    await ApiRequest.deleteMany({ collectionId: req.params.id });
    await Collection.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Collection deleted' });
  }
);

// ── Folders ──────────────────────────────────────────────────────────────────

router.get('/collections/:collectionId/folders',
  async (req: AuthRequest, res: Response) => {
    const folders = await Folder.find({ collectionId: req.params.collectionId })
      .sort({ order: 1 }).lean();
    return res.json(folders);
  }
);

router.post('/collections/:collectionId/folders',
  async (req: AuthRequest, res: Response) => {
    const { name, parentFolderId, description, preRequestScript, testScript } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const count = await Folder.countDocuments({
      collectionId: req.params.collectionId,
      parentFolderId: parentFolderId ?? null,
    });
    const folder = await Folder.create({
      collectionId: req.params.collectionId,
      parentFolderId: parentFolderId ?? null,
      name, description, preRequestScript, testScript, order: count,
    });
    return res.status(201).json(folder);
  }
);

router.put('/folders/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Folder, 'editor'), async (req: AuthRequest, res: Response) => {
  const folder = await Folder.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!folder) return res.status(404).json({ message: 'Folder not found' });
  return res.json(folder);
});

router.delete('/folders/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Folder, 'editor'), async (req: AuthRequest, res: Response) => {
  await Folder.deleteMany({ parentFolderId: req.params.id });
  await ApiRequest.deleteMany({ folderId: req.params.id });
  await Folder.findByIdAndDelete(req.params.id);
  return res.json({ message: 'Folder deleted' });
});

// ── Requests ─────────────────────────────────────────────────────────────────

router.get('/collections/:collectionId/requests',
  async (req: AuthRequest, res: Response) => {
    const filter: any = { collectionId: req.params.collectionId };
    if (req.query.folderId !== undefined) {
      filter.folderId = req.query.folderId === 'null' ? null : req.query.folderId;
    }
    const requests = await ApiRequest.find(filter).sort({ order: 1 }).lean();
    return res.json(requests);
  }
);

router.post('/collections/:collectionId/requests',
  async (req: AuthRequest, res: Response) => {
    const count = await ApiRequest.countDocuments({
      collectionId: req.params.collectionId,
      folderId: req.body.folderId ?? null,
    });
    const request = await ApiRequest.create({
      ...req.body,
      collectionId: req.params.collectionId,
      order: count,
      createdBy: req.user!._id,
    });

    const col = await Collection.findById(req.params.collectionId).lean();
    if (col) {
      logAudit(req.user!._id as any, 'create_request', {
        targetType: 'Request',
        targetId: request._id as any,
        details: { requestId: request._id, requestName: request.name }
      }).catch(() => {});
    }

    return res.status(201).json(request);
  }
);

router.get('/requests/:id', async (req: AuthRequest, res: Response) => {
  const request = await ApiRequest.findById(req.params.id).lean();
  if (!request) return res.status(404).json({ message: 'Request not found' });
  return res.json(request);
});

router.put('/requests/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {
  const request = await ApiRequest.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!request) return res.status(404).json({ message: 'Request not found' });
  return res.json(request);
});

router.delete('/requests/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {
  await ApiRequest.findByIdAndDelete(req.params.id);
  return res.json({ message: 'Request deleted' });
});

// ── POST /api/requests/:id/comments ───────────────────────────────────────
router.post('/requests/:id/comments', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Text is required' });
    
    const request = await ApiRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    
    request.comments.push({
      userId: req.user!._id,
      text,
      createdAt: new Date()
    });
    
    await request.save();
    return res.json(request);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/requests/:id/comments/:commentId ──────────────────────────
router.delete('/requests/:id/comments/:commentId', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const request = await ApiRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    
    request.comments = request.comments.filter((c: any) => c._id?.toString() !== req.params.commentId);
    await request.save();
    
    res.json(request);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Reorder ─────────────────────────────────────────────────────────────────
router.put('/reorder', async (req: AuthRequest, res: Response) => {
  const { type, items } = req.body as {
    type: 'collection' | 'folder' | 'request';
    items: Array<{ id: string; order: number }>;
  };

  const ModelMap = {
    collection: Collection,
    folder: Folder,
    request: ApiRequest,
  };
  const Model = ModelMap[type] as mongoose.Model<any>;
  if (!Model) return res.status(400).json({ message: 'Invalid type' });

  await Promise.all(
    items.map(({ id, order }) => Model.findByIdAndUpdate(id, { order }))
  );
  return res.json({ message: 'Reordered' });
});

export default router;

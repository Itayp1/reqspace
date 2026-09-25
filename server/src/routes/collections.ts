import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole, getUserWorkspaceRole } from '../middleware/rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { logAudit } from '../repositories/AuditLogRepository';
export type UserRole = 'viewer' | 'editor' | 'owner';
import { emitToWorkspace } from '../socketUtils';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

type ItemKind = 'collection' | 'folder' | 'request';

/** Resolves the owning workspace id for a collection/folder/request. */
async function resolveWorkspaceId(kind: ItemKind, id: string): Promise<string | null> {
  if (kind === 'collection') {
    const c = await CollectionRepository.findById(id);
    return c ? c.workspaceId : null;
  }
  if (kind === 'folder') {
    const f = await FolderRepository.findById(id);
    if (!f) return null;
    const c = await CollectionRepository.findById(f.collectionId);
    return c ? c.workspaceId : null;
  }
  const r = await RequestRepository.findById(id);
  if (!r) return null;
  const c = await CollectionRepository.findById(r.collectionId);
  return c ? c.workspaceId : null;
}

/**
 * Resolves the item's workspace, exposes it as `resolvedWorkspaceId` (so the
 * update/delete handlers can address the socket room — CR#9), then enforces the
 * role. Runs the resolution even for superadmins, who bypass the role check but
 * still need the broadcast to fire.
 */
function checkPermission(kind: ItemKind, minRole: UserRole) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id || req.params.collectionId;
      const workspaceId = await resolveWorkspaceId(kind, id);
      if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
      req.params.workspaceId = workspaceId;
      (req as any).resolvedWorkspaceId = workspaceId;
      if (req.user?.isSuperAdmin) return next();
      return requireWorkspaceRole(minRole)(req, res, next);
    } catch (e) {
      next(e);
    }
  };
}

router.use(authenticate);

// ── Collections ─────────────────────────────────────────────────────────────

router.get('/workspaces/:workspaceId/collections',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const collections = await CollectionRepository.findByWorkspace(req.params.workspaceId);
    return res.json(collections);
  }
);

router.post('/workspaces/:workspaceId/collections',
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const { name, description, variables, preRequestScript, testScript } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });

    const order = await CollectionRepository.countByWorkspace(req.params.workspaceId);
    const collection = await CollectionRepository.create({
      workspaceId: req.params.workspaceId,
      name, description, variables, preRequestScript, testScript,
      order,
      createdBy: String(req.user!._id),
    });
    emitToWorkspace(req.params.workspaceId, 'collection:created', collection);
    return res.status(201).json(collection);
  }
);

router.put('/collections/:id', checkPermission('collection', 'editor'), async (req: AuthRequest, res: Response) => {
  // Allowlist writable fields — never reassign workspaceId (CR#7).
  const { name, description, variables, preRequestScript, testScript, order } = req.body;
  const patch: any = {};
  for (const [k, v] of Object.entries({ name, description, variables, preRequestScript, testScript, order })) {
    if (v !== undefined) patch[k] = v;
  }
  const collection = await CollectionRepository.update(req.params.id, patch);
  emitToWorkspace((req as any).resolvedWorkspaceId, 'collection:updated', collection);
  return res.json(collection);
});

router.delete('/collections/:id', checkPermission('collection', 'editor'), async (req: AuthRequest, res: Response) => {
  await FolderRepository.deleteByCollection(req.params.id);
  await RequestRepository.deleteByCollection(req.params.id);
  await CollectionRepository.delete(req.params.id);
  emitToWorkspace((req as any).resolvedWorkspaceId, 'collection:deleted', req.params.id);
  return res.json({ message: 'Collection deleted' });
});

// ── Folders ──────────────────────────────────────────────────────────────────

router.get('/collections/:collectionId/folders',
  checkPermission('collection', 'viewer'),
  async (req: AuthRequest, res: Response) => {
    const folders = await FolderRepository.findByCollection(req.params.collectionId);
    return res.json(folders);
  }
);

router.post('/collections/:collectionId/folders',
  checkPermission('collection', 'editor'),
  async (req: AuthRequest, res: Response) => {
    const { name, parentFolderId, description, preRequestScript, testScript } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const order = await FolderRepository.countInCollection(req.params.collectionId, parentFolderId ?? null);
    const folder = await FolderRepository.create({
      collectionId: req.params.collectionId,
      parentFolderId: parentFolderId ?? null,
      name, description, preRequestScript, testScript, order,
    });
    emitToWorkspace((req as any).resolvedWorkspaceId, 'folder:created', folder);
    return res.status(201).json(folder);
  }
);

router.put('/folders/:id', checkPermission('folder', 'editor'), async (req: AuthRequest, res: Response) => {
  const { name, description, parentFolderId, preRequestScript, testScript, order } = req.body;
  const patch: any = {};
  for (const [k, v] of Object.entries({ name, description, parentFolderId, preRequestScript, testScript, order })) {
    if (v !== undefined) patch[k] = v;
  }
  const folder = await FolderRepository.update(req.params.id, patch);
  if (!folder) return res.status(404).json({ message: 'Folder not found' });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'folder:updated', folder);
  return res.json(folder);
});

router.delete('/folders/:id', checkPermission('folder', 'editor'), async (req: AuthRequest, res: Response) => {
  await FolderRepository.deleteByParent(req.params.id);
  await RequestRepository.deleteByFolder(req.params.id);
  await FolderRepository.delete(req.params.id);
  emitToWorkspace((req as any).resolvedWorkspaceId, 'folder:deleted', req.params.id);
  return res.json({ message: 'Folder deleted' });
});

// ── Requests ─────────────────────────────────────────────────────────────────

router.get('/collections/:collectionId/requests',
  checkPermission('collection', 'viewer'),
  async (req: AuthRequest, res: Response) => {
    let requests;
    if (req.query.folderId !== undefined) {
      const folderId = req.query.folderId === 'null' ? null : String(req.query.folderId);
      requests = folderId === null
        ? (await RequestRepository.findByCollection(req.params.collectionId)).filter(r => r.folderId === null)
        : await RequestRepository.findByFolder(folderId);
    } else {
      requests = await RequestRepository.findByCollection(req.params.collectionId);
    }
    return res.json(requests);
  }
);

router.post('/collections/:collectionId/requests',
  checkPermission('collection', 'editor'),
  async (req: AuthRequest, res: Response) => {
    const order = await RequestRepository.countInCollection(req.params.collectionId, req.body.folderId ?? null);
    // Allowlist request fields rather than spreading req.body wholesale (CR#7).
    const { name, method, url, params, headers, auth, body, preRequestScript, testScript, description, folderId } = req.body;
    const request = await RequestRepository.create({
      name: name || 'New Request',
      method, url, params, headers, auth, body, preRequestScript, testScript, description,
      folderId: folderId ?? null,
      collectionId: req.params.collectionId,
      order,
      createdBy: String(req.user!._id),
    });

    logAudit(String(req.user!._id), 'create_request', {
      targetType: 'Request',
      targetId: String(request._id),
      details: { requestId: request._id, requestName: request.name },
    }).catch(() => {});

    emitToWorkspace((req as any).resolvedWorkspaceId, 'request:created', request);
    return res.status(201).json(request);
  }
);

router.get('/requests/:id',
  checkPermission('request', 'viewer'),
  async (req: AuthRequest, res: Response) => {
    const request = await RequestRepository.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    return res.json(request);
  }
);

router.put('/requests/:id', checkPermission('request', 'editor'), async (req: AuthRequest, res: Response) => {
  const { name, method, url, params, headers, auth, body, preRequestScript, testScript, description, folderId, order } = req.body;
  const patch: any = {};
  for (const [k, v] of Object.entries({ name, method, url, params, headers, auth, body, preRequestScript, testScript, description, folderId, order })) {
    if (v !== undefined) patch[k] = v;
  }
  const request = await RequestRepository.update(req.params.id, patch);
  if (!request) return res.status(404).json({ message: 'Request not found' });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'request:updated', request);
  return res.json(request);
});

router.delete('/requests/:id', checkPermission('request', 'editor'), async (req: AuthRequest, res: Response) => {
  await RequestRepository.delete(req.params.id);
  emitToWorkspace((req as any).resolvedWorkspaceId, 'request:deleted', req.params.id);
  return res.json({ message: 'Request deleted' });
});

// ── POST /api/requests/:id/comments ───────────────────────────────────────
router.post('/requests/:id/comments', checkPermission('request', 'viewer'), async (req: AuthRequest, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ message: 'Text is required' });

  const request = await RequestRepository.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  const commentId = uuidv4();
  const comments = [
    ...request.comments,
    { id: commentId, userId: String(req.user!._id), text, createdAt: new Date() },
  ];
  const updated = await RequestRepository.update(req.params.id, { comments });
  return res.json(updated);
});

// ── DELETE /api/requests/:id/comments/:commentId ──────────────────────────
router.delete('/requests/:id/comments/:commentId', checkPermission('request', 'viewer'), async (req: AuthRequest, res: Response) => {
  const request = await RequestRepository.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  const comment = request.comments.find((c: any) => String(c.id ?? c._id) === req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  // Only the comment's author or an editor/owner (or superadmin) may delete it
  // — previously any viewer could delete anyone's comment (CR#12).
  const isAuthor = String(comment.userId) === String(req.user!._id);
  let isEditor = !!req.user!.isSuperAdmin;
  if (!isEditor) {
    const role = await getUserWorkspaceRole(String(req.user!._id), (req as any).resolvedWorkspaceId);
    isEditor = role === 'editor' || role === 'owner';
  }
  if (!isAuthor && !isEditor) {
    return res.status(403).json({ message: 'You can only delete your own comments' });
  }

  const comments = request.comments.filter((c: any) => String(c.id ?? c._id) !== req.params.commentId);
  const updated = await RequestRepository.update(req.params.id, { comments });
  return res.json(updated);
});

// ── Reorder ─────────────────────────────────────────────────────────────────
router.put('/reorder', async (req: AuthRequest, res: Response) => {
  const { type, items } = req.body as {
    type: ItemKind;
    items: Array<{ id: string; order: number }>;
  };

  const repoMap = {
    collection: CollectionRepository,
    folder: FolderRepository,
    request: RequestRepository,
  } as const;
  const repo = repoMap[type];
  if (!repo) return res.status(400).json({ message: 'Invalid type' });
  if (!items?.length) return res.json({ message: 'Reordered' });

  // Resolve every item's workspace and confirm the caller may edit there.
  const workspaceIds = new Set<string>();
  for (const it of items) {
    const workspaceId = await resolveWorkspaceId(type, it.id);
    if (!workspaceId) return res.status(400).json({ message: 'Could not resolve workspace for item' });
    workspaceIds.add(workspaceId);
  }

  if (!req.user!.isSuperAdmin) {
    for (const workspaceId of workspaceIds) {
      const role = await getUserWorkspaceRole(String(req.user!._id), workspaceId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: 'Editor role required in this workspace' });
      }
    }
  }

  await Promise.all(items.map(({ id, order }) => (repo as any).update(id, { order })));
  for (const workspaceId of workspaceIds) {
    emitToWorkspace(workspaceId, 'workspace:reordered', undefined);
  }
  return res.json({ message: 'Reordered' });
});

export default router;

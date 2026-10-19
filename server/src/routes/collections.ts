import { validate } from '../middleware/validate';
import * as schemas from '../schemas/collections.schemas';
import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole, getUserWorkspaceRole } from '../middleware/rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { logAudit } from '../repositories/AuditLogRepository';
export type UserRole = 'viewer' | 'editor' | 'owner';
import { emitToWorkspace } from '../socketUtils';
import { workspaceIdCache } from '../utils/cache';
import { CascadeRepository } from '../repositories/CascadeRepository';
import { recordHandledError } from '../utils/errorReporter';
import { v4 as uuidv4 } from 'uuid';
// Lazy import to avoid circular deps: forks.ts → collections.ts
let _syncForks: ((id: string) => Promise<void>) | null = null;
async function loadForksModule() {
  const m = await import('./forks');
  _syncForks = m.syncForksOfCollection;
}
// Fire-and-forget: propagate a source-side change to any forks of this
// collection. Called after every collection/folder/request create, update,
// or delete so forks stay in sync (CR: this was previously defined but never
// called from any route, so auto-sync never actually ran).
function syncForksAsync(collectionId: string) {
  (async () => {
    if (!_syncForks) await loadForksModule();
    await _syncForks!(collectionId);
  })().catch((err) => recordHandledError('fork-sync', err, { route: `fork-sync:${collectionId}` }));
}

const router = Router();
type ItemKind = 'collection' | 'folder' | 'request';
const ROLE_RANK: Record<UserRole, number> = { viewer: 1, editor: 2, owner: 3 };

async function resolveWorkspaceId(kind: ItemKind, id: string): Promise<string | null> {
  const cacheKey = `${kind}:${id}`;
  const cached = workspaceIdCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let workspaceId: string | null = null;
  if (kind === 'collection') {
    const c = await CollectionRepository.findById(id);
    workspaceId = c ? c.workspaceId : null;
  } else if (kind === 'folder') {
    const f = await FolderRepository.findById(id);
    if (f) {
      const c = await CollectionRepository.findById(f.collectionId);
      workspaceId = c ? c.workspaceId : null;
    }
  } else {
    const r = await RequestRepository.findById(id);
    if (r) {
      const c = await CollectionRepository.findById(r.collectionId);
      workspaceId = c ? c.workspaceId : null;
    }
  }
  
  workspaceIdCache.set(cacheKey, workspaceId);
  return workspaceId;
}

function checkPermission(kind: ItemKind, minRole: UserRole) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id || req.params.collectionId;
      const workspaceId = await resolveWorkspaceId(kind, id);
      if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
      req.params.workspaceId = workspaceId;
      (req as any).resolvedWorkspaceId = workspaceId;
      if (req.user?.isSuperAdmin) return next();

      const wsRole = await getUserWorkspaceRole(String(req.user!._id), workspaceId);
      if (!wsRole) return res.status(403).json({ message: 'Access denied: not a workspace member' });

      let effectiveRole: UserRole = wsRole as UserRole;
      if (kind === 'collection') {
        const collectionId = req.params.id || req.params.collectionId;
        const collection = await CollectionRepository.findById(collectionId);
        if (collection && Array.isArray(collection.roles) && collection.roles.length > 0) {
          const colEntry = collection.roles.find((r: any) => String(r.userId) === String(req.user!._id));
          if (colEntry && ROLE_RANK[colEntry.role as UserRole] < ROLE_RANK[effectiveRole]) {
            effectiveRole = colEntry.role as UserRole;
          }
        }
      }

      if (ROLE_RANK[effectiveRole] < ROLE_RANK[minRole]) {
        return res.status(403).json({ message: `Requires ${minRole} role (your role: ${effectiveRole})` });
      }
      return next();
    } catch (e) {
      next(e);
    }
  };
}

router.use(authenticate);

// A move is a write to the destination collection too, so the caller needs
// editor rights there and the destination must be in the same workspace.
async function authorizeMoveTarget(req: AuthRequest, res: Response, targetCollectionId: string): Promise<boolean> {
  const targetWs = await resolveWorkspaceId('collection', targetCollectionId);
  if (!targetWs || targetWs !== String((req as any).resolvedWorkspaceId)) {
    res.status(400).json({ message: 'Target collection must be in the same workspace' });
    return false;
  }
  if (req.user?.isSuperAdmin) return true;
  const wsRole = await getUserWorkspaceRole(String(req.user!._id), targetWs);
  let effectiveRole = (wsRole || 'viewer') as UserRole;
  const target = await CollectionRepository.findById(targetCollectionId);
  const entry = Array.isArray(target?.roles) ? target!.roles.find((r: any) => String(r.userId) === String(req.user!._id)) : undefined;
  if (entry && ROLE_RANK[entry.role as UserRole] < ROLE_RANK[effectiveRole]) effectiveRole = entry.role as UserRole;
  if (!wsRole || ROLE_RANK[effectiveRole] < ROLE_RANK.editor) {
    res.status(403).json({ message: 'Requires editor role on the target collection' });
    return false;
  }
  return true;
}

// ?full=1 returns every collection with complete request records, for clients
// that keep the whole workspace in memory. Without it the response stays the
// capped, summary-only shape.
router.get('/workspaces/:workspaceId/tree', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const full = req.query.full === '1' || req.query.full === 'true';
  const collections = await CollectionRepository.findByWorkspace(req.params.workspaceId, full ? undefined : { limit: 200 });
  const ids = collections.map(c => c._id);
  if (ids.length === 0) return res.json({ collections, folders: [], requests: [] });
  const [folders, requests] = await Promise.all([
    FolderRepository.findByCollections(ids),
    RequestRepository.findByCollections(ids, { summaryOnly: !full }),
  ]);
  return res.json({ collections, folders, requests });
});

router.get('/workspaces/:workspaceId/collections', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const collections = await CollectionRepository.findByWorkspace(req.params.workspaceId);
  return res.json(collections);
});

router.post('/workspaces/:workspaceId/collections', validate(schemas.createCollectionSchema), requireWorkspaceRole('editor'), async (req: AuthRequest, res: Response) => {
  const { name, description, variables, preRequestScript, testScript } = req.body;
  if (!name) return res.status(400).json({ message: 'name required' });
  const order = await CollectionRepository.countByWorkspace(req.params.workspaceId);
  const collection = await CollectionRepository.create({ workspaceId: req.params.workspaceId, name, description, variables, preRequestScript, testScript, order, createdBy: String(req.user!._id) });
  logAudit(String(req.user!._id), 'collection.create', { targetType: 'Workspace', targetId: String(req.params.workspaceId), details: { collectionId: collection._id, name: collection.name } });
  emitToWorkspace(req.params.workspaceId, 'collection:created', collection);
  return res.status(201).json(collection);
});

// Registered before '/collections/:id' — Express matches routes in
// registration order, and ':id' would otherwise swallow this path with
// id='reorder', silently failing schema validation on the wrong shape.
router.put('/collections/reorder', validate(schemas.reorderSchema), async (req: AuthRequest, res: Response) => {
  const { type, items } = req.body as { type: ItemKind; items: Array<{ id: string; order: number }> };
  if (!items?.length) return res.json({ message: 'Reordered' });
  if (items.length > 500) return res.status(400).json({ message: 'Too many items (max 500)' });

  const { SqlCollection, SqlFolder, SqlRequest } = await import('../db/sql-models');
  const modelMap = { collection: SqlCollection, folder: SqlFolder, request: SqlRequest };
  const Model = modelMap[type];
  if (!Model) return res.status(400).json({ message: 'Invalid type' });

  const workspaceIds = new Set<string>();
  const itemIds = items.map(it => it.id);

  if (type === 'collection') {
    const collections = await SqlCollection.findAll({ where: { id: itemIds }, attributes: ['id', 'workspaceId'], raw: true });
    collections.forEach((c: any) => workspaceIds.add(c.workspaceId));
  } else {
    const records = await (Model as any).findAll({ where: { id: itemIds }, attributes: ['id', 'collectionId'], raw: true });
    const colIds = [...new Set(records.map((r: any) => r.collectionId))];
    if (colIds.length > 0) {
      const collections = await SqlCollection.findAll({ where: { id: colIds }, attributes: ['id', 'workspaceId'], raw: true });
      collections.forEach((c: any) => workspaceIds.add(c.workspaceId));
    }
  }

  if (workspaceIds.size === 0 && items.length > 0) {
    return res.status(400).json({ message: 'Could not resolve workspace for item' });
  }

  if (!req.user!.isSuperAdmin) {
    // Usually only 1 workspace is involved, but if multiple, this is a small loop over unique workspaces.
    for (const workspaceId of workspaceIds) {
      const role = await getUserWorkspaceRole(String(req.user!._id), workspaceId);
      if (!role || role === 'viewer') return res.status(403).json({ message: 'Editor role required in this workspace' });
    }
  }

  // Plain per-row UPDATEs, not bulkCreate+updateOnDuplicate: the latter's
  // upsert path still builds a full INSERT for the conflict row, which fails
  // NOT NULL constraints (e.g. requests.collectionId) since only id/order are
  // supplied here.
  await Promise.all(items.map(it => (Model as any).update({ order: it.order }, { where: { id: it.id } })));

  for (const workspaceId of workspaceIds) emitToWorkspace(workspaceId, 'workspace:reordered', undefined);
  return res.json({ message: 'Reordered' });
});

router.put('/collections/:id', validate(schemas.updateCollectionSchema), checkPermission('collection', 'editor'), async (req: AuthRequest, res: Response) => {
  const { name, description, variables, auth, preRequestScript, testScript, order } = req.body;
  const patch: any = {};
  for (const [k, v] of Object.entries({ name, description, variables, auth, preRequestScript, testScript, order })) { if (v !== undefined) patch[k] = v; }
  const collection = await CollectionRepository.update(req.params.id, patch);
  logAudit(String(req.user!._id), 'collection.update', { targetType: 'Workspace', targetId: String((req as any).resolvedWorkspaceId), details: { collectionId: req.params.id, fields: Object.keys(patch) } });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'collection:updated', collection);
  syncForksAsync(req.params.id);
  return res.json(collection);
});

router.delete('/collections/:id', checkPermission('collection', 'editor'), async (req: AuthRequest, res: Response) => {
  // Folders, requests, share links and fork bookkeeping go with it.
  await CascadeRepository.deleteCollectionTree(req.params.id);
  workspaceIdCache.delete(`collection:${req.params.id}`);
  logAudit(String(req.user!._id), 'collection.delete', { targetType: 'Workspace', targetId: String((req as any).resolvedWorkspaceId), details: { collectionId: req.params.id } });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'collection:deleted', req.params.id);
  return res.json({ message: 'Collection deleted' });
});

router.get('/collections/:collectionId/folders', checkPermission('collection', 'viewer'), async (req: AuthRequest, res: Response) => {
  const folders = await FolderRepository.findByCollection(req.params.collectionId);
  return res.json(folders);
});

router.post('/collections/:collectionId/folders', validate(schemas.createFolderSchema), checkPermission('collection', 'editor'), async (req: AuthRequest, res: Response) => {
  const { name, parentFolderId, description, preRequestScript, testScript } = req.body;
  if (!name) return res.status(400).json({ message: 'name required' });
  if (parentFolderId) {
    const parent = await FolderRepository.findById(parentFolderId);
    if (!parent || parent.collectionId !== req.params.collectionId) return res.status(400).json({ message: 'Parent folder must be in this collection' });
  }
  const order = await FolderRepository.countInCollection(req.params.collectionId, parentFolderId ?? null);
  const folder = await FolderRepository.create({ collectionId: req.params.collectionId, parentFolderId: parentFolderId ?? null, name, description, preRequestScript, testScript, order });
  logAudit(String(req.user!._id), 'folder.create', { targetType: 'Workspace', targetId: String((req as any).resolvedWorkspaceId), details: { folderId: folder._id, name: folder.name, collectionId: req.params.collectionId } });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'folder:created', folder);
  syncForksAsync(req.params.collectionId);
  return res.status(201).json(folder);
});

router.put('/folders/:id', validate(schemas.updateFolderSchema), checkPermission('folder', 'editor'), async (req: AuthRequest, res: Response) => {
  const { name, description, parentFolderId, auth, preRequestScript, testScript, order, collectionId } = req.body;
  const patch: any = {};
  for (const [k, v] of Object.entries({ name, description, parentFolderId, auth, preRequestScript, testScript, order })) { if (v !== undefined) patch[k] = v; }

  const current = await FolderRepository.findById(req.params.id);
  if (!current) return res.status(404).json({ message: 'Folder not found' });
  const destCollectionId: string = collectionId ?? current.collectionId;
  const collectionChanged = destCollectionId !== current.collectionId;
  const parentChanged = parentFolderId !== undefined && (parentFolderId ?? null) !== (current.parentFolderId ?? null);
  // Everything nested under the folder moves with it, and a folder can't be
  // dropped into its own subtree.
  const subtreeFolderIds: string[] = [];
  if (collectionChanged || parentChanged) {
    if (collectionChanged && !(await authorizeMoveTarget(req, res, destCollectionId))) return;
    const siblings = await FolderRepository.findByCollection(current.collectionId);
    const queue = [current._id];
    while (queue.length) {
      const id = queue.shift()!;
      subtreeFolderIds.push(id);
      for (const f of siblings) if (f.parentFolderId === id) queue.push(f._id);
    }
    if (parentFolderId) {
      if (subtreeFolderIds.includes(parentFolderId)) return res.status(400).json({ message: 'A folder cannot be moved into itself' });
      const parent = await FolderRepository.findById(parentFolderId);
      if (!parent || parent.collectionId !== destCollectionId) return res.status(400).json({ message: 'Parent folder must be in the target collection' });
    }
    if (collectionChanged) patch.collectionId = destCollectionId;
    if (order === undefined) patch.order = await FolderRepository.countInCollection(destCollectionId, parentFolderId !== undefined ? (parentFolderId ?? null) : (current.parentFolderId ?? null));
  }

  const folder = await FolderRepository.update(req.params.id, patch);
  if (!folder) return res.status(404).json({ message: 'Folder not found' });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'folder:updated', folder);
  if (collectionChanged) {
    for (const fid of subtreeFolderIds) {
      if (fid !== folder._id) {
        const child = await FolderRepository.update(fid, { collectionId: destCollectionId });
        if (child) emitToWorkspace((req as any).resolvedWorkspaceId, 'folder:updated', child);
      }
      for (const r of await RequestRepository.findByFolder(fid)) {
        const moved = await RequestRepository.update(r._id, { collectionId: destCollectionId }, { silent: true });
        if (moved) emitToWorkspace((req as any).resolvedWorkspaceId, 'request:updated', moved);
      }
    }
    syncForksAsync(current.collectionId);
  }
  syncForksAsync(folder.collectionId);
  return res.json(folder);
});

router.delete('/folders/:id', checkPermission('folder', 'editor'), async (req: AuthRequest, res: Response) => {
  const folder = await FolderRepository.findById(req.params.id);
  // The whole subtree: nested folders and the requests inside any of them.
  // Deleting one level used to orphan everything below it.
  const removed = await CascadeRepository.deleteFolderTree(req.params.id);
  for (const id of removed) workspaceIdCache.delete(`folder:${id}`);
  logAudit(String(req.user!._id), 'folder.delete', { targetType: 'Workspace', targetId: String((req as any).resolvedWorkspaceId), details: { folderId: req.params.id, name: folder?.name } });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'folder:deleted', req.params.id);
  if (folder) syncForksAsync(folder.collectionId);
  return res.json({ message: 'Folder deleted' });
});

/**
 * Attaches an `authorName` to every comment. The stored shape only has a
 * `userId`, so without this the UI had nothing to show but "You" or the
 * literal word "User" for everyone else.
 */
async function withCommentAuthors<T extends { comments: any[] } | null>(request: T): Promise<T> {
  if (!request || !request.comments?.length) return request;
  const userIds = [...new Set(request.comments.map((c: any) => String(c.userId)))];
  const { SqlUser } = await import('../db/sql-models');
  const users = await SqlUser.findAll({ where: { id: userIds }, attributes: ['id', 'name'], raw: true });
  const names = new Map(users.map((u: any) => [String(u.id), u.name]));
  return {
    ...request,
    comments: request.comments.map((c: any) => ({ ...c, authorName: names.get(String(c.userId)) ?? 'Unknown user' })),
  };
}

router.get('/collections/:collectionId/requests', checkPermission('collection', 'viewer'), async (req: AuthRequest, res: Response) => {
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
});

router.post('/collections/:collectionId/requests', validate(schemas.createRequestSchema), checkPermission('collection', 'editor'), async (req: AuthRequest, res: Response) => {
  if (req.body.folderId) {
    const folder = await FolderRepository.findById(req.body.folderId);
    if (!folder || folder.collectionId !== req.params.collectionId) return res.status(400).json({ message: 'Folder must be in this collection' });
  }
  const order = await RequestRepository.countInCollection(req.params.collectionId, req.body.folderId ?? null);
  const { name, method, url, params, headers, auth, body, settings, preRequestScript, testScript, description, folderId } = req.body;
  const request = await RequestRepository.create({ name: name || 'New Request', method, url, params, headers, auth, body, settings, preRequestScript, testScript, description, folderId: folderId ?? null, collectionId: req.params.collectionId, order, createdBy: String(req.user!._id) });
  // targetId is the workspace, not the request: GET /workspaces/:id/activity
  // filters audit rows by targetId, so logging the request id here meant the
  // workspace Activity tab could never show this (or anything else). The
  // request's own id and name stay in `details`.
  logAudit(String(req.user!._id), 'create_request', {
    targetType: 'Workspace',
    targetId: String((req as any).resolvedWorkspaceId),
    details: { requestId: request._id, requestName: request.name, collectionId: req.params.collectionId },
  }).catch(() => {});
  emitToWorkspace((req as any).resolvedWorkspaceId, 'request:created', request);
  syncForksAsync(req.params.collectionId);
  return res.status(201).json(request);
});

router.get('/requests/:id', checkPermission('request', 'viewer'), async (req: AuthRequest, res: Response) => {
  const request = await RequestRepository.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Request not found' });
  // This is the route a page reload reads comments back through, so it needs
  // the same author enrichment the POST/DELETE responses get.
  return res.json(await withCommentAuthors(request));
});

router.put('/requests/:id', validate(schemas.updateRequestSchema), checkPermission('request', 'editor'), async (req: AuthRequest, res: Response) => {
  const { name, method, url, params, headers, auth, body, settings, preRequestScript, testScript, description, folderId, order, collectionId } = req.body;
  const patch: any = {};
  for (const [k, v] of Object.entries({ name, method, url, params, headers, auth, body, settings, preRequestScript, testScript, description, folderId, order })) { if (v !== undefined) patch[k] = v; }

  const current = await RequestRepository.findById(req.params.id);
  if (!current) return res.status(404).json({ message: 'Request not found' });
  const destCollectionId: string = collectionId ?? current.collectionId;
  const collectionChanged = destCollectionId !== current.collectionId;
  const folderChanged = folderId !== undefined && (folderId ?? null) !== (current.folderId ?? null);
  if (collectionChanged || folderChanged) {
    if (collectionChanged && !(await authorizeMoveTarget(req, res, destCollectionId))) return;
    if (folderId) {
      const folder = await FolderRepository.findById(folderId);
      if (!folder || folder.collectionId !== destCollectionId) return res.status(400).json({ message: 'Folder must be in the target collection' });
    }
    // Moving to another collection without naming a folder lands at its root.
    const destFolderId = folderId !== undefined ? (folderId ?? null) : (collectionChanged ? null : current.folderId ?? null);
    if (collectionChanged) { patch.collectionId = destCollectionId; patch.folderId = destFolderId; }
    if (order === undefined) patch.order = await RequestRepository.countInCollection(destCollectionId, destFolderId);
  }

  const locationOnly = Object.keys(patch).every(k => k === 'collectionId' || k === 'folderId' || k === 'order');
  const request = await RequestRepository.update(req.params.id, patch, { silent: locationOnly });
  if (!request) return res.status(404).json({ message: 'Request not found' });
  emitToWorkspace((req as any).resolvedWorkspaceId, 'request:updated', request);
  if (collectionChanged) syncForksAsync(current.collectionId);
  syncForksAsync(request.collectionId);
  return res.json(request);
});

router.delete('/requests/:id', checkPermission('request', 'editor'), async (req: AuthRequest, res: Response) => {
  const request = await RequestRepository.findById(req.params.id);
  await RequestRepository.delete(req.params.id);
  workspaceIdCache.delete(`request:${req.params.id}`);
  emitToWorkspace((req as any).resolvedWorkspaceId, 'request:deleted', req.params.id);
  if (request) syncForksAsync(request.collectionId);
  return res.json({ message: 'Request deleted' });
});

router.post('/requests/:id/comments', validate(schemas.addCommentSchema), checkPermission('request', 'viewer'), async (req: AuthRequest, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ message: 'Text is required' });
  const request = await RequestRepository.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Request not found' });
  const commentId = uuidv4();
  const comments = [...request.comments, { id: commentId, userId: String(req.user!._id), text, createdAt: new Date() }];
  // silent: a comment is not an edit of the request. Bumping updatedAt made the
  // author's own open tab look stale, so their next Save raised a false
  // "newer version on the server" conflict.
  const updated = await RequestRepository.update(req.params.id, { comments }, { silent: true });
  return res.json(await withCommentAuthors(updated));
});

router.delete('/requests/:id/comments/:commentId', checkPermission('request', 'viewer'), async (req: AuthRequest, res: Response) => {
  const request = await RequestRepository.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Request not found' });
  const comment = request.comments.find((c: any) => String(c.id ?? c._id) === req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });
  const isAuthor = String(comment.userId) === String(req.user!._id);
  let isEditor = !!req.user!.isSuperAdmin;
  if (!isEditor) {
    const role = await getUserWorkspaceRole(String(req.user!._id), (req as any).resolvedWorkspaceId);
    isEditor = role === 'editor' || role === 'owner';
  }
  if (!isAuthor && !isEditor) return res.status(403).json({ message: 'You can only delete your own comments' });
  const comments = request.comments.filter((c: any) => String(c.id ?? c._id) !== req.params.commentId);
  const updated = await RequestRepository.update(req.params.id, { comments }, { silent: true });
  return res.json(await withCommentAuthors(updated));
});

export default router;

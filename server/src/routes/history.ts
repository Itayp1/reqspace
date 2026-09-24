import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole, requireWorkspaceRole } from '../middleware/rbac';
import { HistoryRepository } from '../repositories/HistoryRepository';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';

const router = Router();
router.use(authenticate);

router.get('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { method, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const result = await HistoryRepository.findPage({
    userId: String(req.user!._id),
    workspaceId: req.params.workspaceId,
    method: method || undefined,
    status: status ? +status : undefined,
    page: +page,
    limit: +limit,
  });
  return res.json(result);
});

router.get('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.findOneForUser(req.params.id, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  return res.json(item);
});

router.delete('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.deleteOneForUser(req.params.id, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  const bodySize = Buffer.byteLength(item.responseSnapshot?.body ?? '', 'utf8');
  await UserRepository.adjustHistoryBytes(String(req.user!._id), -bodySize);
  return res.json({ message: 'Deleted' });
});

router.delete('/history', async (req: AuthRequest, res: Response) => {
  await HistoryRepository.deleteByUser(String(req.user!._id));
  await UserRepository.setHistoryBytes(String(req.user!._id), 0);
  return res.json({ message: 'All history cleared' });
});

router.delete('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const removed = await HistoryRepository.deleteByUserWorkspace(String(req.user!._id), req.params.workspaceId);
  const freed = removed.reduce((sum, h) => sum + Buffer.byteLength(h.responseSnapshot?.body ?? '', 'utf8'), 0);
  await UserRepository.adjustHistoryBytes(String(req.user!._id), -freed);
  return res.json({ message: 'History cleared' });
});

import { validateBody } from '../validation/validate';
import { historySaveSchema } from '../validation/schemas';

router.post('/history/:id/save', validateBody(historySaveSchema), async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.findOneForUser(req.params.id, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });

  const { collectionId, folderId, name } = req.body;
  if (!collectionId) return res.status(400).json({ message: 'collectionId required' });

  const collection = await CollectionRepository.findById(collectionId);
  if (!collection) return res.status(404).json({ message: 'Collection not found' });
  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), collection.workspaceId);
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required to save into this collection' });
    }
  }
  if (folderId) {
    const folder = await FolderRepository.findById(folderId);
    if (!folder || folder.collectionId !== collection._id) {
      return res.status(400).json({ message: 'folderId does not belong to the collection' });
    }
  }

  const count = await RequestRepository.countInCollection(collectionId, folderId ?? null);
  const headers = item.requestSnapshot.headers ?? {};
  const request = await RequestRepository.create({
    collectionId,
    folderId: folderId ?? null,
    name: name || item.requestSnapshot.url,
    method: item.requestSnapshot.method,
    url: item.requestSnapshot.url,
    headers: Object.entries(headers).map(([key, value]) => ({ key, value, enabled: true })),
    params: item.requestSnapshot.params ?? [],
    body: { mode: 'raw', raw: item.requestSnapshot.body ?? '' },
    order: count,
    createdBy: String(req.user!._id),
  });
  return res.status(201).json(request);
});

export default router;

export async function saveHistoryEntry(
  userId: string,
  workspaceId: string,
  data: {
    requestSnapshot: Record<string, unknown>;
    responseBody: string;
    responseStatus: number;
    responseStatusText: string;
    responseHeaders: Record<string, string>;
    responseTime: number;
    responseSize: number;
    testResults: Array<{ name: string; passed: boolean; error?: string }>;
  }
) {
  const user = await UserRepository.findById(userId);
  if (!user?.settings?.saveHistory) return;

  const config = await SystemConfigRepository.getConfig();
  const maxBodyKB = (config?.history.maxRequestBodyKB ?? 10) * 1024;
  const maxTotalMB = (config?.history.maxTotalPerUserMB ?? 20) * 1024 * 1024;

  let body = data.responseBody;
  let bodyTruncated = false;
  if (Buffer.byteLength(body, 'utf8') > maxBodyKB) {
    body = body.substring(0, maxBodyKB) + '... [truncated]';
    bodyTruncated = true;
  }

  const bodySize = Buffer.byteLength(body, 'utf8');
  let usedBytes = user.historyUsedBytes ?? 0;
  while (usedBytes + bodySize > maxTotalMB) {
    const oldest = await HistoryRepository.findOldest(userId);
    if (!oldest) break;
    const oldSize = Buffer.byteLength(oldest.responseSnapshot?.body ?? '', 'utf8');
    await HistoryRepository.delete(oldest._id);
    usedBytes -= oldSize;
  }

  await HistoryRepository.create({
    userId,
    workspaceId,
    requestSnapshot: data.requestSnapshot,
    responseSnapshot: {
      status: data.responseStatus,
      statusText: data.responseStatusText,
      headers: data.responseHeaders,
      body,
      bodyTruncated,
      responseTime: data.responseTime,
      size: data.responseSize,
    },
    testResults: data.testResults,
    executedAt: new Date(),
  });

  await UserRepository.setHistoryBytes(userId, Math.max(0, usedBytes + bodySize));
}

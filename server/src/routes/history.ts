import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { HistoryRepository, IHistoryRecord, IHistorySnapshotRequest } from '../repositories/HistoryRepository';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { validateBody, historySaveBody } from '../validation/body';

const router = Router();
router.use(authenticate);

function responseBody(item: IHistoryRecord): string {
  return item.responseSnapshot?.body ?? item.responseData?.body ?? '';
}

router.get('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { method, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const { items, total } = await HistoryRepository.query({
    userId: String(req.user!._id),
    workspaceId: req.params.workspaceId as string,
    method: method || undefined,
    status: status ? +status : undefined,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum,
  });
  return res.json({ items, total });
});

router.get('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.findOwned(req.params.id as string, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  return res.json(item);
});

router.delete('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.deleteOwned(req.params.id as string, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });

  const bodySize = Buffer.byteLength(responseBody(item), 'utf8');
  const user = await UserRepository.findById(String(req.user!._id));
  if (user) {
    await UserRepository.update(user.id, { historyUsedBytes: Math.max(0, (user.historyUsedBytes ?? 0) - bodySize) });
  }
  return res.json({ message: 'Deleted' });
});

router.delete('/history', async (req: AuthRequest, res: Response) => {
  await HistoryRepository.deleteByUser(String(req.user!._id));
  await UserRepository.update(String(req.user!._id), { historyUsedBytes: 0 });
  return res.json({ message: 'All history cleared' });
});

router.delete('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const userId = String(req.user!._id);
  const removed = await HistoryRepository.listForUser(userId, req.params.workspaceId as string);
  const freed = removed.reduce((sum, h) => sum + Buffer.byteLength(responseBody(h), 'utf8'), 0);
  await HistoryRepository.deleteByUser(userId, req.params.workspaceId as string);
  const user = await UserRepository.findById(userId);
  if (user) {
    await UserRepository.update(userId, { historyUsedBytes: Math.max(0, (user.historyUsedBytes ?? 0) - freed) });
  }
  return res.json({ message: 'History cleared' });
});

router.post('/history/:id/save', validateBody(historySaveBody), async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.findOwned(req.params.id as string, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });

  const { collectionId, folderId, name } = req.body;
  if (!collectionId) return res.status(400).json({ message: 'collectionId required' });

  const collection = await CollectionRepository.findById(collectionId);
  if (!collection) return res.status(404).json({ message: 'Collection not found' });
  if (!req.user!.isSuperAdmin) {
    const { getUserWorkspaceRole } = await import('../middleware/rbac');
    const role = await getUserWorkspaceRole(String(req.user!._id), collection.workspaceId);
    if (!role || role === 'viewer') return res.status(403).json({ message: 'Editor role required' });
  }

  const count = await RequestRepository.countInCollection(collectionId, folderId ?? null);
  const snap = item.requestSnapshot;
  const headers = Array.isArray(snap.headers)
    ? snap.headers
    : Object.entries(snap.headers ?? {}).map(([key, value]) => ({ key, value, enabled: true }));
  const request = await RequestRepository.create({
    collectionId,
    folderId: folderId ?? null,
    name: name || snap.url || 'Saved request',
    method: snap.method || item.method || 'GET',
    url: snap.url || item.url || '',
    headers,
    params: snap.params ?? [],
    body: { mode: 'raw', raw: snap.body ?? '' },
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
    requestSnapshot: IHistorySnapshotRequest;
    responseBody: string;
    responseStatus: number;
    responseStatusText: string;
    responseHeaders: Record<string, string>;
    responseTime: number;
    responseSize: number;
    testResults: Array<{ name: string; passed: boolean; error?: string }>;
  }
) {
  const user = await UserRepository.findById(String(userId));
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
    const oldest = await HistoryRepository.findOldest(String(userId));
    if (!oldest) break;
    const oldSize = Buffer.byteLength(responseBody(oldest), 'utf8');
    await HistoryRepository.delete(oldest.id);
    usedBytes -= oldSize;
  }

  await HistoryRepository.createFromSnapshots({
    userId: String(userId),
    workspaceId: String(workspaceId),
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

  await UserRepository.update(String(userId), {
    historyUsedBytes: Math.max(0, usedBytes + bodySize),
  });
}

import { validate } from '../middleware/validate';
import * as schemas from '../schemas/history.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { requireRoleOnCollection } from '../middleware/resolveWorkspace';
import { SqlHistory } from '../db/sql-models';
import { UserRepository } from '../repositories/UserRepository';
import { RequestRepository } from '../repositories/RequestRepository';

const router = Router();
router.use(authenticate);

// ── GET /api/workspaces/:workspaceId/history ────────────────────────────────
// Require workspace membership — previously this filtered on userId only, with
// no membership check (CR#11).
router.get('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { method, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const where: any = {
    userId: req.user!._id || req.user!.id,
    workspaceId: req.params.workspaceId,
  };
  if (method) where.method = method.toUpperCase();
  if (status) where.statusCode = +status;

  const items = await SqlHistory.findAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (+page - 1) * +limit,
    limit: +limit,
  });
  const total = await SqlHistory.count({ where });
  return res.json({ items: items.map(i => ({...i.toJSON(), requestSnapshot: JSON.parse(i.requestData), responseSnapshot: JSON.parse(i.responseData), _id: i.id})), total });
});

// ── GET /api/history/:id ────────────────────────────────────────────────────
router.get('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await SqlHistory.findOne({
    where: {
      id: req.params.id,
      userId: req.user!._id || req.user!.id,
    }
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  const parsed = item.toJSON();
  return res.json({ ...parsed, _id: parsed.id, requestSnapshot: JSON.parse(parsed.requestData), responseSnapshot: JSON.parse(parsed.responseData) });
});

// ── DELETE /api/history/:id ─────────────────────────────────────────────────
router.delete('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await SqlHistory.findOne({
    where: {
      id: req.params.id,
      userId: req.user!._id || req.user!.id,
    }
  });
  if (!item) return res.status(404).json({ message: 'Not found' });

  await item.destroy();

  const bodySize = Buffer.byteLength(JSON.parse(item.responseData)?.body ?? '', 'utf8');
  const user = await UserRepository.findById(req.user!._id || req.user!.id);
  if (user) {
    await UserRepository.update(user.id, { historyUsedBytes: Math.max(0, user.historyUsedBytes - bodySize) } as any);
  }
  return res.json({ message: 'Deleted' });
});

// ── DELETE /api/history ─ Clear all history for user ──────────────────
router.delete('/history', async (req: AuthRequest, res: Response) => {
  await SqlHistory.destroy({ where: { userId: req.user!._id || req.user!.id } });
  const user = await UserRepository.findById(req.user!._id || req.user!.id);
  if (user) {
    await UserRepository.update(user.id, { historyUsedBytes: 0 } as any);
  }
  return res.json({ message: 'All history cleared' });
});

// ── DELETE /api/workspaces/:workspaceId/history – Clear all ─────────────────
router.delete('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const removed = await SqlHistory.findAll({ where: { userId: req.user!._id || req.user!.id, workspaceId: req.params.workspaceId } });
  const freed = removed.reduce((sum, h: any) => sum + Buffer.byteLength(JSON.parse(h.responseData)?.body ?? '', 'utf8'), 0);
  await SqlHistory.destroy({ where: { userId: req.user!._id || req.user!.id, workspaceId: req.params.workspaceId } });
  const user = await UserRepository.findById(req.user!._id || req.user!.id);
  if (user) {
    await UserRepository.update(user.id, { historyUsedBytes: Math.max(0, user.historyUsedBytes - freed) } as any);
  }
  return res.json({ message: 'History cleared' });
});

// ── POST /api/history/:id/save – Save to Collection ─────────────────────────
// The collectionId comes from the body, so membership on its workspace has to be
// resolved and checked — without this the route writes a request into any
// collection whose id the caller can guess.
router.post('/history/:id/save', validate(schemas.saveHistorySchema), requireRoleOnCollection('editor'), async (req: AuthRequest, res: Response) => {
  const item = await SqlHistory.findOne({
    where: {
      id: req.params.id,
      userId: req.user!._id || req.user!.id,
    }
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  const parsedItem = { requestSnapshot: JSON.parse(item.requestData) };

  const { collectionId, folderId, name } = req.body;
  if (!collectionId) return res.status(400).json({ message: 'collectionId required' });

  const count = await RequestRepository.countInCollection(collectionId, folderId ?? null);
  const request = await RequestRepository.create({
    collectionId,
    folderId: folderId ?? null,
    name: name || parsedItem.requestSnapshot.url,
    method: parsedItem.requestSnapshot.method,
    url: parsedItem.requestSnapshot.url,
    headers: Object.entries(parsedItem.requestSnapshot.headers ?? {}).map(([key, value]) => ({
      key, value: String(value), enabled: true,
    })),
    params: parsedItem.requestSnapshot.params ?? [],
    body: { mode: 'raw', raw: parsedItem.requestSnapshot.body ?? '' },
    order: count,
    createdBy: req.user!._id || req.user!.id,
    auth: { type: 'none' },
    preRequestScript: '',
    testScript: '',
    comments: [],
    description: ''
  });
  return res.status(201).json(request);
});

export default router;

// ─── History GC Service ─────────────────────────────────────────────────────
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
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

  // GC: remove oldest entries if over limit
  let usedBytes = user.historyUsedBytes ?? 0;
  while (usedBytes + bodySize > maxTotalMB) {
    const oldest = await SqlHistory.findOne({ where: { userId }, order: [['createdAt', 'ASC']] });
    if (!oldest) break;
    const oldSize = Buffer.byteLength(JSON.parse(oldest.responseData)?.body ?? '', 'utf8');
    await oldest.destroy();
    usedBytes -= oldSize;
  }

  await SqlHistory.create({
    userId,
    workspaceId,
    method: data.requestSnapshot.method as string || 'GET',
    url: data.requestSnapshot.url as string || '',
    statusCode: data.responseStatus,
    duration: data.responseTime,
    requestData: JSON.stringify(data.requestSnapshot),
    responseData: JSON.stringify({
      status: data.responseStatus,
      statusText: data.responseStatusText,
      headers: data.responseHeaders,
      body,
      bodyTruncated,
      responseTime: data.responseTime,
      size: data.responseSize,
      testResults: data.testResults,
    })
  });

  await UserRepository.update(user.id, { historyUsedBytes: Math.max(0, usedBytes + bodySize) } as any);
}

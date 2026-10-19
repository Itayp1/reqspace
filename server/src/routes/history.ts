import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';
import { validate } from '../middleware/validate';
import * as schemas from '../schemas/history.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { requireRoleOnCollection } from '../middleware/resolveWorkspace';
import { Op } from 'sequelize';
import { SqlHistory } from '../db/sql-models';
import { sanitizeRequestSnapshot } from '../utils/historySnapshot';
import { UserRepository } from '../repositories/UserRepository';
import { RequestRepository } from '../repositories/RequestRepository';

const router = Router();
router.use(authenticate);

// ── POST /api/workspaces/:workspaceId/history ───────────────────────────────
router.post('/workspaces/:workspaceId/history', validate(schemas.createHistoryEntrySchema), requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { workspaceId } = req.params;
  const userId = req.user!._id || req.user!.id;
  const {
    requestSnapshot,
    responseBody,
    responseStatus,
    responseStatusText,
    responseHeaders,
    responseTime,
    responseSize,
    testResults = []
  } = req.body;

  try {
    await saveHistoryEntry(userId, workspaceId, {
      requestSnapshot,
      responseBody,
      responseStatus,
      responseStatusText,
      responseHeaders,
      responseTime,
      responseSize,
      testResults
    });
    return res.status(201).json({ message: 'History saved' });
  } catch (error) {
    console.error('Error saving history', error);
    noteRouteError(res, error);
    return res.status(500).json({ message: 'Failed to save history' });
  }
});

// ── GET /api/workspaces/:workspaceId/history ────────────────────────────────
// Require workspace membership — previously this filtered on userId only, with
// no membership check (CR#11).
router.get('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { method, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const where: any = {
    userId: req.user!._id || req.user!.id,
    workspaceId: req.params.workspaceId,
  };
  if (typeof method === 'string' && method) where.method = method.toUpperCase();
  if (status && Number.isFinite(+status)) where.statusCode = +status;
  // Non-numeric page/limit used to reach the query as NaN and fail with a 500,
  // and limit had no ceiling at all.
  const pageNum = Math.max(1, Math.floor(Number(page)) || 1);
  const limitNum = Math.min(200, Math.max(1, Math.floor(Number(limit)) || 50));

  const items = await SqlHistory.findAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (pageNum - 1) * limitNum,
    limit: limitNum,
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

// ── DELETE /api/history ─ Clear history for the specified workspace ────
// workspaceId is required — omitting it previously deleted ALL history for
// the user across every workspace (K4.6 data-loss bug).
router.delete('/history', async (req: AuthRequest, res: Response) => {
  const { workspaceId } = req.query;
  if (!workspaceId || typeof workspaceId !== 'string') {
    return res.status(400).json({ message: 'workspaceId is required' });
  }
  const userId = req.user!._id || req.user!.id;
  const freed = (await SqlHistory.sum('responseSizeBytes', { where: { userId, workspaceId } })) || 0;
  await SqlHistory.destroy({ where: { userId, workspaceId } });
  const user = await UserRepository.findById(userId);
  if (user) {
    await UserRepository.update(user.id, { historyUsedBytes: Math.max(0, user.historyUsedBytes - freed) } as any);
  }
  return res.json({ message: 'History cleared' });
});

// ── DELETE /api/workspaces/:workspaceId/history – Clear all ─────────────────
router.delete('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const freed = (await SqlHistory.sum('responseSizeBytes', { where: { userId: req.user!._id || req.user!.id, workspaceId: req.params.workspaceId } })) || 0;
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

  // Idempotent: saving the same history entry into the same collection/folder
  // again returns the request created the first time. Concurrent saves are
  // serialised per (entry, collection, folder) so the race can't create two.
  const lockKey = `${item.id}|${collectionId}|${folderId ?? ''}|${name ?? ''}`;
  const prior = saveLocks.get(lockKey) ?? Promise.resolve();
  const run = prior.catch(() => undefined).then(async () => {
    const reqName = name || parsedItem.requestSnapshot.url;
    const existing = (await RequestRepository.findByCollection(collectionId)).find(r =>
      (r.folderId ?? null) === (folderId ?? null) &&
      r.name === reqName && r.method === parsedItem.requestSnapshot.method && r.url === parsedItem.requestSnapshot.url &&
      r.createdBy === (req.user!._id || req.user!.id));
    if (existing) return { request: existing, created: false };
    return { request: await createFromHistory(), created: true };
  });
  saveLocks.set(lockKey, run);
  let outcome;
  try { outcome = await run; } finally { if (saveLocks.get(lockKey) === run) saveLocks.delete(lockKey); }
  return res.status(outcome.created ? 201 : 200).json(outcome.request);

  async function createFromHistory() {
  const count = await RequestRepository.countInCollection(collectionId, folderId ?? null);
  return RequestRepository.create({
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
  }
});
const saveLocks = new Map<string, Promise<unknown>>();

export default router;

// ─── History GC Service ─────────────────────────────────────────────────────
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { noteRouteError } from '../utils/errorReporter';
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
  if (!user || user.settings?.saveHistory === false) return;

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
  const requestSnapshot = sanitizeRequestSnapshot(data.requestSnapshot, maxBodyKB);

  // GC: remove oldest entries if over limit
  let usedBytes = user.historyUsedBytes ?? 0;
  if (usedBytes + bodySize > maxTotalMB) {
    const historyList = await SqlHistory.findAll({ 
      attributes: ['id', 'responseSizeBytes'],
      where: { userId }, 
      order: [['createdAt', 'ASC']] 
    });
    
    let toDeleteIds = [];
    for (const h of historyList) {
      if (usedBytes + bodySize <= maxTotalMB) break;
      toDeleteIds.push(h.id);
      usedBytes -= (h.responseSizeBytes || 0);
    }
    
    if (toDeleteIds.length > 0) {
      await SqlHistory.destroy({ where: { id: toDeleteIds } });
    }
  }

  // Age and count caps from System Settings (0 / unset = off). Applied before
  // the insert so the new entry always survives its own pruning.
  const retentionDays = config?.history.retentionDays ?? 0;
  if (retentionDays > 0) {
    await SqlHistory.destroy({ where: { userId, createdAt: { [Op.lt]: new Date(Date.now() - retentionDays * 86_400_000) } } });
  }
  const maxRecords = config?.history.maxRecords ?? 0;
  if (maxRecords > 0) {
    const stale = await SqlHistory.findAll({
      attributes: ['id'],
      where: { userId },
      order: [['createdAt', 'DESC']],
      offset: maxRecords - 1,
      raw: true,
    });
    if (stale.length > 0) await SqlHistory.destroy({ where: { id: stale.map((h: any) => h.id) } });
  }

  await SqlHistory.create({
    userId,
    workspaceId,
    method: data.requestSnapshot.method as string || 'GET',
    url: data.requestSnapshot.url as string || '',
    statusCode: data.responseStatus,
    duration: data.responseTime,
    requestData: JSON.stringify(requestSnapshot),
    responseData: JSON.stringify({
      status: data.responseStatus,
      statusText: data.responseStatusText,
      headers: data.responseHeaders,
      body,
      bodyTruncated,
      responseTime: data.responseTime,
      size: data.responseSize,
      testResults: data.testResults,
    }),
    responseSizeBytes: bodySize
  });

  await UserRepository.update(user.id, { historyUsedBytes: Math.max(0, usedBytes + bodySize) } as any);
}

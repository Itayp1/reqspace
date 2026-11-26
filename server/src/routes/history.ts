import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';
import { validate } from '../middleware/validate';
import * as schemas from '../schemas/history.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { requireRoleOnCollection } from '../middleware/resolveWorkspace';
import { Op } from 'sequelize';
import { SqlHistory, SqlUser } from '../db/sql-models';
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

  const bodySize = item.responseSizeBytes || 0;
  const user = await UserRepository.findById(req.user!._id || req.user!.id);
  if (user) {
    await adjustUsage(user.id, -bodySize);
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
    await adjustUsage(user.id, -freed);
  }
  return res.json({ message: 'History cleared' });
});

// ── DELETE /api/workspaces/:workspaceId/history – Clear all ─────────────────
router.delete('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const freed = (await SqlHistory.sum('responseSizeBytes', { where: { userId: req.user!._id || req.user!.id, workspaceId: req.params.workspaceId } })) || 0;
  await SqlHistory.destroy({ where: { userId: req.user!._id || req.user!.id, workspaceId: req.params.workspaceId } });
  const user = await UserRepository.findById(req.user!._id || req.user!.id);
  if (user) {
    await adjustUsage(user.id, -freed);
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

  const requestSnapshot = sanitizeRequestSnapshot(data.requestSnapshot, maxBodyKB);
  const requestJson = JSON.stringify(requestSnapshot);
  const responseJson = JSON.stringify({
    status: data.responseStatus,
    statusText: data.responseStatusText,
    headers: data.responseHeaders,
    body,
    bodyTruncated,
    responseTime: data.responseTime,
    size: data.responseSize,
    testResults: data.testResults,
  });
  // Stored size of the whole entry (not just the body), so many small responses can't pile up unbounded.
  const bodySize = Buffer.byteLength(requestJson, 'utf8') + Buffer.byteLength(responseJson, 'utf8');

  // Pruning is serialised per user+workspace (check-then-delete would otherwise overshoot under bursts) and
  // must never lose the entry being saved. `freed` is every byte removed here, for one atomic counter update.
  let freed = 0;
  const key = `${userId}|${workspaceId}`;
  const prior = pruneLocks.get(key) ?? Promise.resolve();
  const run = prior.catch(() => undefined).then(async () => {
    try {
      // Per user (all workspaces). The counter on the user row can drift, so confirm with the real sum before deleting.
      if ((user.historyUsedBytes ?? 0) + bodySize > maxTotalMB) {
        const real = (await SqlHistory.sum('responseSizeBytes', { where: { userId } })) || 0;
        if (real + bodySize > maxTotalMB) freed += await evictOldest({ userId }, real + bodySize - maxTotalMB);
      }

      // Per user and workspace: oldest entries go first. Evicting down to 90% of the cap means the
      // scan below runs about once per hundreds of inserts instead of on each one.
      const cap = (config?.history.maxTotalPerWorkspaceMB ?? 10) * 1024 * 1024;
      if (cap > 0) {
        const total = (await SqlHistory.sum('responseSizeBytes', { where: { userId, workspaceId } })) || 0;
        if (total + bodySize > cap) freed += await evictOldest({ userId, workspaceId }, total + bodySize - Math.floor(cap * 0.9));
      }

      // Age and count caps from System Settings (0 / unset = off). Applied before
      // the insert so the new entry always survives its own pruning.
      const retentionDays = config?.history.retentionDays ?? 0;
      if (retentionDays > 0) {
        const old = { userId, createdAt: { [Op.lt]: new Date(Date.now() - retentionDays * 86_400_000) } };
        const bytes = (await SqlHistory.sum('responseSizeBytes', { where: old })) || 0;
        if (bytes > 0 || (await SqlHistory.count({ where: old })) > 0) { await SqlHistory.destroy({ where: old }); freed += bytes; }
      }
      const maxRecords = config?.history.maxRecords ?? 0;
      if (maxRecords > 0 && (await SqlHistory.count({ where: { userId } })) >= maxRecords) {
        const stale = await SqlHistory.findAll({
          attributes: ['id', 'responseSizeBytes'], where: { userId }, order: [['createdAt', 'DESC'], ['id', 'DESC']], offset: maxRecords - 1, raw: true,
        }) as Array<{ id: string; responseSizeBytes: number }>;
        await destroyIds(stale.map(h => h.id));
        freed += stale.reduce((n, h) => n + (h.responseSizeBytes || 0), 0);
      }
    } catch (e) {
      console.error('History pruning failed; saving the entry anyway', e);
    }

    await SqlHistory.create({
      userId,
      workspaceId,
      method: data.requestSnapshot.method as string || 'GET',
      url: data.requestSnapshot.url as string || '',
      statusCode: data.responseStatus,
      duration: data.responseTime,
      requestData: requestJson,
      responseData: responseJson,
      responseSizeBytes: bodySize
    });
  });
  pruneLocks.set(key, run);
  try { await run; } finally { if (pruneLocks.get(key) === run) pruneLocks.delete(key); }

  // Atomic: concurrent saves each add their own delta instead of overwriting one another's absolute value.
  await adjustUsage(user.id, bodySize - freed);
}

const pruneLocks = new Map<string, Promise<unknown>>();

// IN-lists of thousands of ids are slow or rejected by some databases (MSSQL, Db2, SQLite statement length).
async function destroyIds(ids: string[]) {
  for (let i = 0; i < ids.length; i += 500) await SqlHistory.destroy({ where: { id: ids.slice(i, i + 500) } });
}

/** Deletes the oldest entries matching `where`, in batches, until at least `needBytes` are freed. Returns the bytes freed. */
async function evictOldest(where: Record<string, string>, needBytes: number): Promise<number> {
  let freed = 0;
  while (freed < needBytes) {
    const batch = await SqlHistory.findAll({
      attributes: ['id', 'responseSizeBytes'], where, order: [['createdAt', 'ASC'], ['id', 'ASC']], limit: 200, raw: true,
    }) as Array<{ id: string; responseSizeBytes: number }>;
    if (batch.length === 0) break;
    const drop: string[] = [];
    for (const h of batch) {
      if (freed >= needBytes) break;
      drop.push(h.id);
      freed += h.responseSizeBytes || 0;
    }
    await destroyIds(drop);
    if (drop.length < batch.length) break;
  }
  return freed;
}

/** Adds `delta` to the user's stored-history counter in one statement (never below 0). */
export async function adjustUsage(userId: string, delta: number) {
  if (delta !== 0) await SqlUser.increment('historyUsedBytes', { by: delta, where: { id: userId } });
  await SqlUser.update({ historyUsedBytes: 0 }, { where: { id: userId, historyUsedBytes: { [Op.lt]: 0 } } });
}

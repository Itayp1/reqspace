import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { requireRoleOnCollection } from '../middleware/resolveWorkspace';
import { HistoryRepository } from '../repositories/HistoryRepository';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { RequestRepository } from '../repositories/RequestRepository';

const router = Router();
router.use(authenticate);

// ── GET /api/workspaces/:workspaceId/history ────────────────────────────────
// Require workspace membership — previously this filtered on userId only, with
// no membership check (CR#11).
router.get('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { method, status, page = '1', limit = '50' } = req.query as Record<string, string>;

  const { items, total } = await HistoryRepository.list(
    {
      userId: String(req.user!._id),
      workspaceId: req.params.workspaceId,
      method: method ? method.toUpperCase() : undefined,
      status: status ? +status : undefined,
    },
    +page,
    +limit,
  );
  return res.json({ items, total });
});

// ── POST /api/workspaces/:workspaceId/history ───────────────────────────────
// After SEC-0 the server never sends the request itself, so the response the
// client saw is the only copy of what happened. The client is not trusted to
// report its own quota usage honestly — saveHistoryEntry recomputes body size
// and caps from SystemConfig regardless of what the request body claims.
router.post('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { requestSnapshot, responseBody, responseStatus, responseStatusText, responseHeaders, responseTime, responseSize, testResults } = req.body || {};
  if (!requestSnapshot || typeof requestSnapshot !== 'object') {
    return res.status(400).json({ message: 'requestSnapshot required' });
  }
  if (typeof responseBody !== 'string' || typeof responseStatus !== 'number') {
    return res.status(400).json({ message: 'responseBody and responseStatus required' });
  }

  await saveHistoryEntry(String(req.user!._id), req.params.workspaceId, {
    requestSnapshot,
    responseBody,
    responseStatus,
    responseStatusText: String(responseStatusText || ''),
    responseHeaders: responseHeaders || {},
    responseTime: Number(responseTime) || 0,
    responseSize: Number(responseSize) || 0,
    testResults: Array.isArray(testResults) ? testResults : [],
  });
  return res.status(201).json({ ok: true });
});

// ── GET /api/history/:id ────────────────────────────────────────────────────
router.get('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.findById(req.params.id, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  return res.json(item);
});

// ── DELETE /api/history/:id ─────────────────────────────────────────────────
router.delete('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.deleteOne(req.params.id, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });

  const bodySize = Buffer.byteLength(item.responseSnapshot?.body ?? '', 'utf8');
  const user = await UserRepository.findById(String(req.user!._id));
  if (user) {
    await UserRepository.update(user._id, {
      historyUsedBytes: Math.max(0, (user.historyUsedBytes ?? 0) - bodySize),
    });
  }
  return res.json({ message: 'Deleted' });
});

// ── DELETE /api/history ─ Clear all history for user ──────────────────
router.delete('/history', async (req: AuthRequest, res: Response) => {
  await HistoryRepository.deleteMany(String(req.user!._id));
  const user = await UserRepository.findById(String(req.user!._id));
  if (user) await UserRepository.update(user._id, { historyUsedBytes: 0 });
  return res.json({ message: 'All history cleared' });
});

// ── DELETE /api/workspaces/:workspaceId/history – Clear all ─────────────────
router.delete('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  // Only clear this user's history in this workspace, and decrement the byte
  // counter by what was actually removed — zeroing it wiped the accounting for
  // the user's history in *other* workspaces too (CR#11).
  const removed = await HistoryRepository.deleteMany(String(req.user!._id), req.params.workspaceId);
  const freed = removed.reduce((sum, h) => sum + Buffer.byteLength(h.responseSnapshot?.body ?? '', 'utf8'), 0);
  const user = await UserRepository.findById(String(req.user!._id));
  if (user) {
    await UserRepository.update(user._id, {
      historyUsedBytes: Math.max(0, (user.historyUsedBytes ?? 0) - freed),
    });
  }
  return res.json({ message: 'History cleared' });
});

// ── POST /api/history/:id/save – Save to Collection ─────────────────────────
// SEC-2 hole #1: this used to create the request in whatever collectionId the
// client sent, with no check that the caller is even a member of the
// workspace that owns it — reachable by anyone with a valid session, just by
// guessing or reusing a collection id. Resolve the collection's workspace and
// require editor before writing into it.
router.post('/history/:id/save', requireRoleOnCollection('editor'), async (req: AuthRequest, res: Response) => {
  const item = await HistoryRepository.findById(req.params.id, String(req.user!._id));
  if (!item) return res.status(404).json({ message: 'Not found' });

  const { collectionId, folderId, name } = req.body;
  if (!collectionId) return res.status(400).json({ message: 'collectionId required' });

  const count = await RequestRepository.countInCollection(collectionId, folderId ?? null);
  const request = await RequestRepository.create({
    collectionId,
    folderId: folderId ?? null,
    name: name || item.requestSnapshot.url,
    method: item.requestSnapshot.method,
    url: item.requestSnapshot.url,
    headers: Object.entries(item.requestSnapshot.headers ?? {}).map(([key, value]) => ({
      key, value, enabled: true,
    })),
    params: item.requestSnapshot.params ?? [],
    body: { mode: 'raw', raw: item.requestSnapshot.body ?? '' },
    order: count,
    createdBy: String(req.user!._id),
  });
  return res.status(201).json(request);
});

export default router;

// ─── History GC Service ─────────────────────────────────────────────────────
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
  // Never trust the client's own byte accounting: recompute from the actual
  // body it sent, regardless of what `data.responseSize` claims.
  if (Buffer.byteLength(body, 'utf8') > maxBodyKB) {
    body = body.substring(0, maxBodyKB) + '... [truncated]';
    bodyTruncated = true;
  }

  const bodySize = Buffer.byteLength(body, 'utf8');

  // GC: remove oldest entries if over limit
  let usedBytes = user.historyUsedBytes ?? 0;
  while (usedBytes + bodySize > maxTotalMB) {
    const oldest = await HistoryRepository.findOldestByUser(userId);
    if (!oldest) break;
    const oldSize = Buffer.byteLength(oldest.responseSnapshot?.body ?? '', 'utf8');
    await HistoryRepository.deleteOne(oldest._id, userId);
    usedBytes -= oldSize;
  }

  await HistoryRepository.create({
    userId,
    workspaceId,
    requestSnapshot: data.requestSnapshot as any,
    responseSnapshot: {
      status: data.responseStatus,
      statusText: data.responseStatusText,
      headers: data.responseHeaders,
      body,
      bodyTruncated,
      responseTime: data.responseTime,
      size: Buffer.byteLength(data.responseBody, 'utf8'),
    },
    testResults: data.testResults,
    executedAt: new Date(),
  });

  await UserRepository.update(userId, {
    historyUsedBytes: Math.max(0, usedBytes + bodySize),
  });
}

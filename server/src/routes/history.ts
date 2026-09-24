import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { History } from '../models/History';
import { User } from '../models/User';
import { SystemConfig } from '../models/SystemConfig';
import { Request as ApiRequest } from '../models/Request';
import { Collection } from '../models/Collection';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);

// ── GET /api/workspaces/:workspaceId/history ────────────────────────────────
// Require workspace membership — previously this filtered on userId only, with
// no membership check (CR#11).
router.get('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const { method, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {
    userId: req.user!._id,
    workspaceId: req.params.workspaceId,
  };
  if (method) query['requestSnapshot.method'] = method.toUpperCase();
  if (status) query['responseSnapshot.status'] = +status;

  const items = await History.find(query)
    .sort({ executedAt: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();
  const total = await History.countDocuments(query);
  return res.json({ items, total });
});

// ── GET /api/history/:id ────────────────────────────────────────────────────
router.get('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await History.findOne({
    _id: req.params.id,
    userId: req.user!._id,
  }).lean();
  if (!item) return res.status(404).json({ message: 'Not found' });
  return res.json(item);
});

// ── DELETE /api/history/:id ─────────────────────────────────────────────────
router.delete('/history/:id', async (req: AuthRequest, res: Response) => {
  const item = await History.findOneAndDelete({
    _id: req.params.id,
    userId: req.user!._id,
  });
  if (!item) return res.status(404).json({ message: 'Not found' });

  const bodySize = Buffer.byteLength(item.responseSnapshot?.body ?? '', 'utf8');
  await User.findByIdAndUpdate(req.user!._id, {
    $inc: { historyUsedBytes: -bodySize },
  });
  return res.json({ message: 'Deleted' });
});

// ── DELETE /api/history ─ Clear all history for user ──────────────────
router.delete('/history', async (req: AuthRequest, res: Response) => {
  await History.deleteMany({ userId: req.user!._id });
  await User.findByIdAndUpdate(req.user!._id, { historyUsedBytes: 0 });
  return res.json({ message: 'All history cleared' });
});

// ── DELETE /api/workspaces/:workspaceId/history – Clear all ─────────────────
router.delete('/workspaces/:workspaceId/history', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  // Only clear this user's history in this workspace, and decrement the byte
  // counter by what was actually removed — zeroing it wiped the accounting for
  // the user's history in *other* workspaces too (CR#11).
  const removed = await History.find({ userId: req.user!._id, workspaceId: req.params.workspaceId }).lean();
  const freed = removed.reduce((sum, h: any) => sum + Buffer.byteLength(h.responseSnapshot?.body ?? '', 'utf8'), 0);
  await History.deleteMany({ userId: req.user!._id, workspaceId: req.params.workspaceId });
  await User.findByIdAndUpdate(req.user!._id, { $inc: { historyUsedBytes: -freed } });
  return res.json({ message: 'History cleared' });
});

// ── POST /api/history/:id/save – Save to Collection ─────────────────────────
router.post('/history/:id/save', async (req: AuthRequest, res: Response) => {
  const item = await History.findOne({
    _id: req.params.id,
    userId: req.user!._id,
  }).lean();
  if (!item) return res.status(404).json({ message: 'Not found' });

  const { collectionId, folderId, name } = req.body;
  if (!collectionId) return res.status(400).json({ message: 'collectionId required' });

  const count = await ApiRequest.countDocuments({ collectionId, folderId: folderId ?? null });
  const request = await ApiRequest.create({
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
    createdBy: req.user!._id,
  });
  return res.status(201).json(request);
});

export default router;

// ─── History GC Service ─────────────────────────────────────────────────────
export async function saveHistoryEntry(
  userId: mongoose.Types.ObjectId,
  workspaceId: mongoose.Types.ObjectId,
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
  const user = await User.findById(userId);
  if (!user?.settings?.saveHistory) return;

  const config = await SystemConfig.findById('global');
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
    const oldest = await History.findOne({ userId }).sort({ executedAt: 1 });
    if (!oldest) break;
    const oldSize = Buffer.byteLength(oldest.responseSnapshot?.body ?? '', 'utf8');
    await History.findByIdAndDelete(oldest._id);
    usedBytes -= oldSize;
  }

  await History.create({
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

  await User.findByIdAndUpdate(userId, {
    historyUsedBytes: Math.max(0, usedBytes + bodySize),
  });
}

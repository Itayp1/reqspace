import { Router, Request, Response } from 'express';
import { SharedLink } from '../models/SharedLink';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { RequestRepository } from '../repositories/RequestRepository';

const router = Router();

const shareReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests for this shared link',
});

const SENSITIVE_HEADER = /authorization|cookie|api-key|x-api-key|token|secret|password/i;

/** Public share payload must not include credentials or scripts (CR#3). */
function redactRequest(r: any) {
  return {
    _id: r._id,
    name: r.name,
    method: r.method,
    url: r.url,
    description: r.description || '',
    params: r.params || [],
    headers: (r.headers || [])
      .filter((h: any) => !SENSITIVE_HEADER.test(String(h.key || '')))
      .map((h: any) => ({ key: h.key, value: h.value, enabled: h.enabled !== false })),
    body: r.body?.mode === 'raw'
      ? { mode: 'raw', raw: r.body.raw, rawLanguage: r.body.rawLanguage }
      : { mode: r.body?.mode || 'none' },
  };
}

function redactCollection(collection: any) {
  return {
    _id: collection._id,
    name: collection.name,
    description: collection.description || '',
    variables: (collection.variables || []).map((v: any) => ({ key: v.key, value: '', enabled: v.enabled !== false })),
  };
}

// GET /api/share/:shortId (PUBLIC)
router.get('/:shortId', shareReadLimiter, async (req: Request, res: Response) => {
  const link = await SharedLink.findOne({ shortId: req.params.shortId });
  if (!link || link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }

  const collection = await CollectionRepository.findById(String(link.collectionId));
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  const requests = await RequestRepository.findByCollection(collection._id);

  return res.json({
    collection: redactCollection(collection),
    requests: requests.map(redactRequest),
    expiresAt: link.expiresAt,
  });
});

// POST /api/share/collection/:id (AUTHENTICATED)
router.post('/collection/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { expiresInDays } = req.body;
  const days = Math.min(Math.max(parseInt(expiresInDays, 10) || 7, 1), 90);

  const collection = await CollectionRepository.findById(req.params.id);
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), String(collection.workspaceId));
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in this workspace to share a collection' });
    }
  }

  // 128 bits. The previous 6-byte id was only 48 bits (CR#3).
  const shortId = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const link = await SharedLink.create({
    shortId,
    collectionId: collection._id,
    workspaceId: collection.workspaceId,
    createdBy: req.user!._id,
    expiresAt,
  });

  return res.json({
    shortId: link.shortId,
    expiresAt: link.expiresAt,
    url: '/share/' + link.shortId,
  });
});

export default router;

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { SharedLinkRepository } from '../repositories/SharedLinkRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { RequestRepository } from '../repositories/RequestRepository';

const router = Router();
const shareLimiter = rateLimit({ windowMs: 60_000, max: 30, message: 'Too many share requests' });

function publicRequest(r: { name: string; method: string; url: string; description?: string }) {
  return { name: r.name, method: r.method, url: r.url, description: r.description || '' };
}

// GET /api/share/:shortId (public, secrets stripped)
router.get('/:shortId', shareLimiter, async (req: Request, res: Response) => {
  const link = await SharedLinkRepository.findByShortId(String(req.params.shortId));
  if (!link || link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }

  const collection = await CollectionRepository.findById(link.collectionId);
  if (!collection) return res.status(404).json({ message: 'Collection not found' });

  const requests = await RequestRepository.findByCollection(collection._id);
  return res.json({
    collection: { name: collection.name, description: collection.description },
    requests: requests.map(publicRequest),
    expiresAt: link.expiresAt,
  });
});

// POST /api/share/collection/:id
router.post('/collection/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { expiresInDays } = req.body;
  const days = Math.min(30, Math.max(1, parseInt(expiresInDays, 10) || 7));

  const collection = await CollectionRepository.findById(req.params.id);
  if (!collection) return res.status(404).json({ message: 'Collection not found' });

  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), collection.workspaceId);
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in this workspace to share a collection' });
    }
  }

  const shortId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const link = await SharedLinkRepository.create({
    shortId,
    collectionId: collection._id,
    workspaceId: collection.workspaceId,
    createdBy: String(req.user!._id),
    expiresAt,
  });

  return res.json({ shortId: link.shortId, expiresAt: link.expiresAt, url: '/share/' + link.shortId });
});

export default router;

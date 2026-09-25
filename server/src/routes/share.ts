import { validate } from '../middleware/validate';
import * as schemas from '../schemas/share.schemas';
import { Router, Request, Response } from 'express';
import { SqlSharedLink, SqlCollection } from '../db/sql-models';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { RequestRepository } from '../repositories/RequestRepository';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const shareGetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: 'Too many requests' });

router.get('/:shortId', shareGetLimiter, async (req: Request, res: Response) => {
  const link = await SqlSharedLink.findOne({ where: { shortId: req.params.shortId } });
  if (!link) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }
  
  if (link.expiresAt && link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link expired' });
  }

  const collection = await SqlCollection.findByPk(link.collectionId, { raw: true });
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  const rawRequests = await RequestRepository.findByCollection(String(collection.id));
  const safeRequests = rawRequests.map(r => ({
    name: r.name,
    method: r.method,
    url: r.url,
    description: r.description,
    headers: r.headers?.filter(h => !h.key?.toLowerCase().match(/auth|token|key|secret|cookie|pass/)),
    auth: { type: r.auth?.type || 'none' }
  }));
  
  return res.json({
    collection: {
      name: collection.name,
      description: collection.description
    },
    requests: safeRequests,
    expiresAt: link.expiresAt
  });
});

router.post('/collection/:id', validate(schemas.createShareSchema), authenticate, async (req: AuthRequest, res: Response) => {
  const { expiresInDays } = req.body;
  const days = parseInt(expiresInDays) || 7;
  
  const collection = await SqlCollection.findByPk(req.params.id);
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), String(collection.workspaceId));
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in this workspace to share a collection' });
    }
  }

  const shortId = crypto.randomBytes(6).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  const token = crypto.randomBytes(32).toString('hex');

  const link = await SqlSharedLink.create({
    shortId, token,
    collectionId: collection.id,
    workspaceId: collection.workspaceId,
    createdBy: req.user!._id,
    expiresAt
  });

  return res.json({ 
    shortId: link.shortId, token, 
    expiresAt: link.expiresAt,
    url: '/share/' + link.shortId
  });
});

router.delete('/:shortId', authenticate, async (req: AuthRequest, res: Response) => {
  const link = await SqlSharedLink.findOne({ where: { shortId: req.params.shortId } });
  if (!link) {
    return res.status(404).json({ message: 'Link not found' });
  }
  if (!req.user!.isSuperAdmin && String(link.createdBy) !== String(req.user!._id)) {
    return res.status(403).json({ message: 'Only the creator can revoke this link' });
  }
  await link.destroy();
  return res.status(200).json({ message: 'Link revoked' });
});

export default router;

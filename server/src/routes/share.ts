import { Router, Request, Response } from 'express';
import { SqlSharedLink, SqlCollection, SqlRequest } from '../db/sql-models';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';

const router = Router();

router.get('/:shortId', async (req: Request, res: Response) => {
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

  const requests = await SqlRequest.findAll({ where: { collectionId: collection.id }, raw: true });
  
  return res.json({
    collection,
    requests,
    expiresAt: link.expiresAt
  });
});

router.post('/collection/:id', authenticate, async (req: AuthRequest, res: Response) => {
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

  const link = await SqlSharedLink.create({
    shortId, token: crypto.randomBytes(32).toString('hex'),
    collectionId: collection.id,
    workspaceId: collection.workspaceId,
    createdBy: req.user!._id,
    expiresAt
  });

  return res.json({ 
    shortId: link.shortId, token: crypto.randomBytes(32).toString('hex'), 
    expiresAt: link.expiresAt,
    url: '/share/' + link.shortId
  });
});

export default router;

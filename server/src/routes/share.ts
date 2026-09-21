import { Router, Request, Response } from 'express';
import { SharedLink } from '../models/SharedLink';
import { Collection } from '../models/Collection';
import { Request as ApiRequest } from '../models/Request';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// ?? GET /api/share/:shortId (PUBLIC) ??
router.get('/:shortId', async (req: Request, res: Response) => {
  const link = await SharedLink.findOne({ shortId: req.params.shortId });
  if (!link) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }
  
  if (link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link expired' });
  }

  // Fetch the collection and its requests
  const collection = await Collection.findById(link.collectionId).lean();
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  const requests = await ApiRequest.find({ collectionId: collection._id }).lean();
  
  return res.json({
    collection,
    requests,
    expiresAt: link.expiresAt
  });
});

// ?? POST /api/share/collection/:id (AUTHENTICATED) ??
router.post('/collection/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { expiresInDays } = req.body;
  const days = parseInt(expiresInDays) || 7;
  
  const collection = await Collection.findById(req.params.id);
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }
  
  const shortId = crypto.randomBytes(6).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const link = await SharedLink.create({
    shortId,
    collectionId: collection._id,
    workspaceId: collection.workspaceId,
    createdBy: req.user!._id,
    expiresAt
  });

  return res.json({ 
    shortId: link.shortId, 
    expiresAt: link.expiresAt,
    url: '/share/' + link.shortId
  });
});

export default router;

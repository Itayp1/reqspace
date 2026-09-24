import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { SharedLinkRepository } from '../repositories/SharedLinkRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { RequestRepository } from '../repositories/RequestRepository';

const router = Router();
const publicShareLimiter = rateLimit({
  name: 'share',
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests for this shared link — please try again later.',
});

const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token)$/i;

function publicCollection(collection: { variables?: unknown; preRequestScript?: string; testScript?: string }) {
  return { ...collection, variables: [], preRequestScript: '', testScript: '' };
}

function publicRequest(request: { headers?: Array<{ key?: string }>; auth?: unknown; preRequestScript?: string; testScript?: string }) {
  return {
    ...request,
    auth: { type: 'none' },
    headers: (request.headers || []).filter(h => !SECRET_HEADER.test(h.key || '')),
    preRequestScript: '',
    testScript: '',
  };
}

router.get('/:shortId', publicShareLimiter, async (req: Request, res: Response) => {
  const link = await SharedLinkRepository.findByShortId(req.params.shortId as string);
  if (!link) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }

  if (link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link expired' });
  }

  const collection = await CollectionRepository.findById(link.collectionId);
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  const requests = await RequestRepository.findByCollection(collection.id);

  return res.json({
    collection: publicCollection(collection),
    requests: requests.map(publicRequest),
    expiresAt: link.expiresAt,
  });
});

router.post('/collection/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { expiresInDays } = req.body;
  const days = parseInt(expiresInDays) || 7;

  const collection = await CollectionRepository.findById(req.params.id as string);
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), String(collection.workspaceId));
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in this workspace to share a collection' });
    }
  }

  const shortId = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const link = await SharedLinkRepository.create({
    shortId,
    collectionId: collection.id,
    workspaceId: collection.workspaceId,
    createdBy: String(req.user!._id),
    expiresAt,
  });

  return res.json({
    shortId: link.shortId,
    expiresAt: link.expiresAt,
    url: '/share/' + link.shortId,
  });
});

export default router;

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';

const router = Router();
router.use(authenticate);

/** Ordered run plan for a collection. The browser runner executes it; the server enforces RBAC and returns the tree. */
router.post('/runner/run', async (req: AuthRequest, res: Response) => {
  const { collectionId } = req.body || {};
  if (!collectionId) return res.status(400).json({ message: 'collectionId is required' });
  const collection = await CollectionRepository.findById(collectionId);
  if (!collection) return res.status(404).json({ message: 'Collection not found' });
  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), collection.workspaceId);
    if (!role) return res.status(403).json({ message: 'Access denied' });
  }
  const [folders, requests] = await Promise.all([
    FolderRepository.findByCollection(collection._id),
    RequestRepository.findByCollection(collection._id),
  ]);
  const ordered = [...requests].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return res.json({
    collection: { _id: collection._id, name: collection.name, preRequestScript: collection.preRequestScript, testScript: collection.testScript },
    folders,
    requests: ordered,
  });
});

export default router;

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole, requireWorkspaceRole } from './rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { isValidId } from '../utils/ids';

/**
 * Requires at least `minRole` on the workspace that owns a collection, where the
 * collection id arrives from the client rather than from a scoped route.
 *
 * `requireWorkspaceRole` can read a workspace id from params or the body, but a
 * client-supplied *collection* id has to be resolved to its workspace first —
 * otherwise a route accepts any collection id at all and writes into a workspace
 * the caller is not a member of. This is the extracted form of the
 * `checkPermission` helper in routes/collections.ts, which already had the right
 * shape but was private to that file.
 */
export function requireRoleOnCollection(
  minRole: UserRole,
  // Where the collection id lives differs per route, and guessing is unsafe:
  // on POST /history/:id/save `req.params.id` is a *history* id, so a chain that
  // fell back to it would resolve the wrong entity and check the wrong workspace.
  getCollectionId: (req: AuthRequest) => string | undefined =
    (req) => req.params.collectionId ?? req.body?.collectionId,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const collectionId = getCollectionId(req);
      if (!collectionId || !isValidId(collectionId)) {
        return res.status(400).json({ message: 'Invalid collection id' });
      }

      const collection = await CollectionRepository.findById(collectionId);
      if (!collection) return res.status(404).json({ message: 'Collection not found' });

      // Resolve first, then check: the handlers downstream use this to address
      // the socket room, and superadmins bypass the role check but still need it.
      req.params.workspaceId = collection.workspaceId;
      (req as any).resolvedWorkspaceId = collection.workspaceId;

      if (req.user?.isSuperAdmin) return next();
      return requireWorkspaceRole(minRole)(req, res, next);
    } catch (e) {
      next(e);
    }
  };
}

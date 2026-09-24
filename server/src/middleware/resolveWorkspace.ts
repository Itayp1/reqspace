import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole } from '../models/User';
import { requireWorkspaceRole } from './rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { isValidId } from '../utils/ids';

/** Default extractor: a `collectionId` sent in the request body (POST/PUT routes) or as a `:collectionId` param. */
function defaultCollectionId(req: AuthRequest): string | undefined {
  return req.body?.collectionId ?? req.params.collectionId;
}

/**
 * Resolves the workspace that owns a client-supplied collection id, exposes
 * it as `req.params.workspaceId` / `req.resolvedWorkspaceId`, then enforces
 * `minRole` on it exactly like `requireWorkspaceRole` does for a directly
 * supplied workspace id.
 *
 * Without this, any route that accepts a `collectionId` from the client and
 * trusts it (SEC-2) lets a non-member read or write into a workspace they
 * were never granted access to, just by guessing or reusing an id.
 *
 * By default the collection id is read from `req.body.collectionId` or
 * `req.params.collectionId`. Pass `getCollectionId` for a route whose
 * `:id` param *is* the collection id (e.g. `GET /collections/:id/export`) —
 * `req.params.id` is deliberately not used by default, since on routes like
 * `POST /history/:id/save` that `:id` names a different resource.
 */
export function requireRoleOnCollection(
  minRole: UserRole,
  getCollectionId: (req: AuthRequest) => string | undefined = defaultCollectionId,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const collectionId = getCollectionId(req);
      if (!collectionId || !isValidId(collectionId)) {
        return res.status(400).json({ message: 'Invalid collection id' });
      }

      const collection = await CollectionRepository.findById(collectionId);
      if (!collection) {
        return res.status(404).json({ message: 'Collection not found' });
      }

      req.params.workspaceId = collection.workspaceId;
      (req as AuthRequest & { resolvedWorkspaceId?: string }).resolvedWorkspaceId = collection.workspaceId;

      if (req.user?.isSuperAdmin) return next();
      return requireWorkspaceRole(minRole)(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole } from '../models/User';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { isValidId } from '../utils/ids';
import { cacheDel, cacheGet, cacheSet, MEMBERSHIP_TTL, membershipCacheKey } from '../utils/cache';

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

/** Get user's role in a workspace */
export function invalidateMembership(workspaceId?: string): void {
  cacheDel(workspaceId ? `role:` : 'role:');
  if (workspaceId) cacheDel(`role:`);
}

export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<UserRole | null> {
  const key = membershipCacheKey(userId, workspaceId);
  const cached = cacheGet<UserRole | null>(key);
  if (cached !== undefined) return cached;
  const role = await loadUserWorkspaceRole(userId, workspaceId);
  cacheSet(key, role, MEMBERSHIP_TTL);
  return role;
}

async function loadUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<UserRole | null> {
  const workspace = await WorkspaceRepository.findById(workspaceId);
  if (!workspace) return null;

  // SuperAdmin always treated as owner
  const member = workspace.members.find(
    (m) => String(m.userId) === String(userId)
  );

  if (member) return member.role as UserRole;
  if (workspace.isPublic) return 'viewer';

  return null;
}

/**
 * Middleware factory: requires at least `minRole` in the workspace.
 * workspaceId is read from req.params.workspaceId or req.params.id
 */
export function requireWorkspaceRole(minRole: UserRole) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

      // SuperAdmin bypasses all workspace role checks
      if (req.user.isSuperAdmin) return next();

      const workspaceId =
        req.params.workspaceId || req.params.id || req.body.workspaceId;

      // Dialect-agnostic: accept both Mongo ObjectIds and SQL UUIDs (CR#1).
      if (!workspaceId || !isValidId(workspaceId)) {
        return res.status(400).json({ message: 'Invalid workspace ID' });
      }

      const role = await getUserWorkspaceRole(String(req.user._id), workspaceId);
      if (!role) {
        return res.status(403).json({ message: 'Access denied: not a workspace member' });
      }

      if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
        return res.status(403).json({
          message: `Requires ${minRole} role (your role: ${role})`,
        });
      }

      // Attach role to request for downstream use
      (req as AuthRequest & { workspaceRole?: UserRole }).workspaceRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function canSave(role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK['editor'];
}

export function canRun(role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK['viewer'];
}

export function canManageMembers(role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK['owner'];
}

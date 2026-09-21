import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Workspace } from '../models/Workspace';
import { UserRole } from '../models/User';
import mongoose from 'mongoose';

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

/** Get user's role in a workspace */
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<UserRole | null> {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return null;

  // SuperAdmin always treated as owner
  const member = workspace.members.find(
    (m) => String(m.userId) === String(userId)
  );
  
  if (member) return member.role;
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

      if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) {
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

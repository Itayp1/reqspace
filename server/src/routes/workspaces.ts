import { validate } from '../middleware/validate';
import * as schemas from '../schemas/workspaces.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
export type UserRole = 'viewer' | 'editor' | 'owner';
import { WorkspaceRepository, IWorkspaceMemberRecord } from '../repositories/WorkspaceRepository';
import { UserRepository } from '../repositories/UserRepository';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { CascadeRepository } from '../repositories/CascadeRepository';
import { AuditLogRepository, logAudit } from '../repositories/AuditLogRepository';
import { workspaceRoleCache } from '../utils/cache';
import { noteRouteError } from '../utils/errorReporter';
import { emitToWorkspace, emitToUser, revokeWorkspaceAccess } from '../socketUtils';

const router = Router();
router.use(authenticate);

const VALID_ROLES: UserRole[] = ['viewer', 'editor', 'owner'];
const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1, editor: 2, owner: 3,
};

/** Attach public profile fields to each member for the UI member list. */
async function enrichMembers(members: IWorkspaceMemberRecord[]) {
  return Promise.all(
    members.map(async (m) => {
      const u = await UserRepository.findById(String(m.userId)).catch(() => null);
      return {
        ...m,
        userId: u
          ? { _id: u._id, id: u._id, name: u.name, email: u.email, avatar: u.avatar }
          : m.userId,
      };
    })
  );
}

// ── GET /api/workspaces ─────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = String(req.user!._id);
  const workspaces = await WorkspaceRepository.findForUser(userId);
  const result = workspaces.map((ws) => {
    const member = ws.members.find((m) => String(m.userId) === userId);
    return { ...ws, myRole: member?.role ?? (ws.isPublic ? 'viewer' : undefined) };
  });
  return res.json(result);
});

// ── POST /api/workspaces ────────────────────────────────────────────────────
router.post('/', validate(schemas.createWorkspaceSchema), async (req: AuthRequest, res: Response) => {
  const { name, description, isPublic } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });

  const user = req.user!;
  const workspace = await WorkspaceRepository.create({
    name,
    description,
    isPublic: isPublic || false,
    ownerId: String(user._id),
  });

  await EnvironmentRepository.upsertGlobal(String(workspace._id), []);

  return res.status(201).json(workspace);
});

// ── GET /api/workspaces/:id ─────────────────────────────────────────────────
router.get('/:id', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const workspace = await WorkspaceRepository.findById(req.params.id);
  if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
  return res.json({ ...workspace, members: await enrichMembers(workspace.members) });
});

router.get('/:id/activity', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 200);
    const skip = Math.max(parseInt(String(req.query.skip), 10) || 0, 0);
    const logs = await AuditLogRepository.list({ targetId: req.params.id }, limit, skip);
    const userIds = [...new Set(logs.map(l => String(l.userId)))];
    const { SqlUser } = await import('../db/sql-models');
    const users = await SqlUser.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'], raw: true });
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const enriched = logs.map(l => {
      const u = userMap.get(String(l.userId));
      return { ...l, userId: u ? { _id: u.id, name: u.name, email: u.email } : l.userId };
    });
    res.json(enriched);
  } catch (err) {
    noteRouteError(res, err);
    res.status(500).json({ message: 'Error fetching activity' });
  }
});

// ── PUT /api/workspaces/:id ─────────────────────────────────────────────────
router.put('/:id', validate(schemas.updateWorkspaceSchema), requireWorkspaceRole('owner'), async (req: AuthRequest, res: Response) => {
  const { name, description, isPublic } = req.body;
  // Allowlist writable fields — never spread req.body into the update (CR#7).
  const patch: { name?: string; description?: string; isPublic?: boolean } = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (isPublic !== undefined) patch.isPublic = isPublic;
  const workspace = await WorkspaceRepository.update(req.params.id, patch);
  if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
  // Public visibility changes who may access the workspace — drop cached roles.
  if (patch.isPublic !== undefined) workspaceRoleCache.deleteBySuffix(`:${req.params.id}`);
  logAudit(String(req.user!._id), 'workspace.update', {
    targetType: 'Workspace', targetId: req.params.id, ip: req.ip, details: patch,
  });
  emitToWorkspace(req.params.id, 'workspace:updated', {
    _id: workspace._id, name: workspace.name, description: workspace.description, isPublic: workspace.isPublic,
  });
  return res.json(workspace);
});

// ── DELETE /api/workspaces/:id ──────────────────────────────────────────────
router.delete('/:id', requireWorkspaceRole('owner'), async (req: AuthRequest, res: Response) => {
  const workspace = await WorkspaceRepository.findById(req.params.id);
  if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
  if (workspace.isPersonal) return res.status(409).json({ message: 'A personal workspace cannot be deleted' });
  // Everything inside goes too: collections, folders, requests, environments,
  // globals, local variables, history, share links. Only the collections used
  // to be removed, which orphaned the rest.
  await CascadeRepository.deleteWorkspaceTree(req.params.id);
  workspaceRoleCache.deleteBySuffix(`:${req.params.id}`);
  logAudit(String(req.user!._id), 'workspace.delete', {
    targetType: 'Workspace', targetId: req.params.id, ip: req.ip, details: { name: workspace.name },
  });
  emitToWorkspace(req.params.id, 'workspace:deleted', { workspaceId: req.params.id, name: workspace.name });
  return res.json({ message: 'Workspace deleted' });
});

// ── POST /api/workspaces/:id/members – Invite ───────────────────────────────
router.post(
    '/:id/members',
    validate(schemas.addWorkspaceMemberSchema),
  requireWorkspaceRole('owner'),
  async (req: AuthRequest, res: Response) => {
    const { email, role } = req.body;
    if (!email || !role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'User identifier and valid role required' });
    }

    const workspace = await WorkspaceRepository.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    // Inviting admin cannot assign role >= own role (unless owner / superadmin)
    const inviterMember = workspace.members.find(
      (m) => String(m.userId) === String(req.user!._id)
    );
    const inviterRole = (inviterMember?.role ?? 'viewer') as UserRole;
    if (!req.user?.isSuperAdmin && ROLE_RANK[role as UserRole] >= ROLE_RANK[inviterRole] && inviterRole !== 'owner') {
      return res.status(403).json({ message: 'Cannot assign role equal or higher than your own' });
    }

    // Exact lookup by email/username — no regex, so no ReDoS (CR#10) and it
    // works identically on Mongo and SQL.
    const targetUser = await UserRepository.findByEmail(String(email).toLowerCase());
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (workspace.members.some((m) => String(m.userId) === String(targetUser._id))) {
      return res.status(409).json({ message: 'User already a member' });
    }

    const members: IWorkspaceMemberRecord[] = [
      ...workspace.members,
      {
        userId: String(targetUser._id),
        role: role as UserRole,
        joinedAt: new Date(),
        invitedBy: String(req.user!._id),
      },
    ];
    await WorkspaceRepository.update(req.params.id, { members });
    workspaceRoleCache.delete(`${String(targetUser._id)}:${req.params.id}`);
    logAudit(String(req.user!._id), 'workspace.member.add', {
      targetType: 'Workspace', targetId: req.params.id, ip: req.ip,
      details: { targetUserId: String(targetUser._id), email: targetUser.email, role },
    });

    return res.status(201).json({ message: 'Member added', member: { userId: targetUser._id, role } });
  }
);

// ── PUT /api/workspaces/:id/members/:userId – Change role ───────────────────
router.put(
    '/:id/members/:userId',
    validate(schemas.updateWorkspaceMemberSchema),
  requireWorkspaceRole('owner'),
  async (req: AuthRequest, res: Response) => {
    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Valid role required' });
    }

    const workspace = await WorkspaceRepository.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const member = workspace.members.find((m) => String(m.userId) === req.params.userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });

    const editorMember = workspace.members.find(
      (m) => String(m.userId) === String(req.user!._id)
    );
    const editorRole = (editorMember?.role ?? 'viewer') as UserRole;
    if (member.role === 'owner' && editorRole !== 'owner' && !req.user?.isSuperAdmin) {
      return res.status(403).json({ message: 'Cannot change owner role' });
    }

    // B5.3 — prevent demoting the last owner, which would leave the workspace
    // without any active owner.
    if (member.role === 'owner' && role !== 'owner') {
      const ownerCount = workspace.members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return res.status(409).json({ message: 'Cannot demote the last owner' });
      }
    }

    const members = workspace.members.map((m) =>
      String(m.userId) === req.params.userId ? { ...m, role: role as UserRole } : m
    );
    await WorkspaceRepository.update(req.params.id, { members });
    workspaceRoleCache.delete(`${req.params.userId}:${req.params.id}`);
    logAudit(String(req.user!._id), 'workspace.member.role_change', {
      targetType: 'Workspace', targetId: req.params.id, ip: req.ip,
      details: { targetUserId: req.params.userId, oldRole: member.role, newRole: role },
    });

    // The member's open tabs switch to the new permissions without a reload.
    emitToUser(req.params.userId, 'workspace:role_changed', { workspaceId: req.params.id, role });

    return res.json({ message: 'Role updated', userId: req.params.userId, role });
  }
);

// ── DELETE /api/workspaces/:id/members/:userId – Remove ─────────────────────
router.delete(
  '/:id/members/:userId',
  // Owners may remove anyone; any member (incl. editor/viewer) may remove
  // themselves ("Leave workspace") — enforced in the handler.
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const isSelf = String(req.user!._id) === req.params.userId;
    if (!isSelf && (req as AuthRequest & { workspaceRole?: UserRole }).workspaceRole !== 'owner' && !req.user?.isSuperAdmin) {
      return res.status(403).json({ message: 'Requires owner role' });
    }
    const workspace = await WorkspaceRepository.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const member = workspace.members.find((m) => String(m.userId) === req.params.userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    if (member.role === 'owner') {
      // Removing an owner is only allowed if there's another owner remaining.
      const ownerCount = workspace.members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return res.status(409).json({ message: 'Cannot remove the last owner' });
      }
    }

    const members = workspace.members.filter((m) => String(m.userId) !== req.params.userId);
    await WorkspaceRepository.update(req.params.id, { members });
    workspaceRoleCache.delete(`${req.params.userId}:${req.params.id}`);
    logAudit(String(req.user!._id), isSelf ? 'workspace.member.leave' : 'workspace.member.remove', {
      targetType: 'Workspace', targetId: req.params.id, ip: req.ip,
      details: { targetUserId: req.params.userId, role: member.role },
    });
    revokeWorkspaceAccess(req.params.userId, req.params.id);

    return res.json({ message: 'Member removed' });
  }
);

export default router;

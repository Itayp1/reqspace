import { validate } from '../middleware/validate';
import * as schemas from '../schemas/workspaces.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
export type UserRole = 'viewer' | 'editor' | 'owner';
import { WorkspaceRepository, IWorkspaceMemberRecord } from '../repositories/WorkspaceRepository';
import { UserRepository } from '../repositories/UserRepository';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { AuditLogRepository } from '../repositories/AuditLogRepository';

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
    const logs = await AuditLogRepository.list({ targetId: req.params.id }, 50);
    const enriched = await Promise.all(
      logs.map(async (l) => {
        const u = await UserRepository.findById(String(l.userId)).catch(() => null);
        return { ...l, userId: u ? { _id: u._id, name: u.name, email: u.email } : l.userId };
      })
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching activity' });
  }
});

// ── PUT /api/workspaces/:id ─────────────────────────────────────────────────
router.put('/:id', validate(schemas.updateWorkspaceSchema), requireWorkspaceRole('owner'), async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  // Allowlist writable fields — never spread req.body into the update (CR#7).
  const patch: { name?: string; description?: string } = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  const workspace = await WorkspaceRepository.update(req.params.id, patch);
  if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
  return res.json(workspace);
});

// ── DELETE /api/workspaces/:id ──────────────────────────────────────────────
router.delete('/:id', requireWorkspaceRole('owner'), async (req: AuthRequest, res: Response) => {
  // Cascade: drop the workspace's collections (and their folders/requests are
  // cleaned up by the collection delete path elsewhere).
  await CollectionRepository.deleteByWorkspace(req.params.id);
  await WorkspaceRepository.delete(req.params.id);
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

    const members = workspace.members.map((m) =>
      String(m.userId) === req.params.userId ? { ...m, role: role as UserRole } : m
    );
    await WorkspaceRepository.update(req.params.id, { members });

    return res.json({ message: 'Role updated', userId: req.params.userId, role });
  }
);

// ── DELETE /api/workspaces/:id/members/:userId – Remove ─────────────────────
router.delete(
  '/:id/members/:userId',
  requireWorkspaceRole('owner'),
  async (req: AuthRequest, res: Response) => {
    const workspace = await WorkspaceRepository.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const member = workspace.members.find((m) => String(m.userId) === req.params.userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    if (member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot remove workspace owner' });
    }

    const members = workspace.members.filter((m) => String(m.userId) !== req.params.userId);
    await WorkspaceRepository.update(req.params.id, { members });

    return res.json({ message: 'Member removed' });
  }
);

export default router;

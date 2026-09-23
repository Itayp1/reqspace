import { Router, Response } from 'express';
import { authenticate, AuthRequest, createPersonalWorkspace } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { Workspace } from '../models/Workspace';
import { User, UserRole } from '../models/User';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);

const VALID_ROLES: UserRole[] = ['viewer', 'editor', 'owner'];
const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1, editor: 2, owner: 3,
};

// ── GET /api/workspaces ─────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!._id;
  const workspaces = await Workspace.find({
    'members.userId': userId,
  }).lean();

  const result = workspaces.map((ws) => {
    const member = ws.members.find((m) => String(m.userId) === String(userId));
    return { ...ws, myRole: member?.role };
  });

  return res.json(result);
});

// ── POST /api/workspaces ────────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, description, isPublic } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });

  const user = req.user!;
  const workspace = await Workspace.create({
    name,
    description,
    isPublic: isPublic || false,
    ownerId: user._id,
    members: [{ userId: user._id, role: 'owner', joinedAt: new Date() }],
  });

  const { EnvironmentRepository } = await import('../repositories/EnvironmentRepository');
  await EnvironmentRepository.upsertGlobal(String(workspace._id), []);

  return res.status(201).json(workspace);
});

// ── GET /api/workspaces/:id ─────────────────────────────────────────────────
router.get('/:id', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  const workspace = await Workspace.findById(req.params.id)
    .populate('members.userId', 'name email avatar')
    .lean();
  if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
  return res.json(workspace);
});

router.get('/:id/activity', requireWorkspaceRole('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const { AuditLog } = await import('../models/AuditLog');
    const logs = await AuditLog.find({ targetId: req.params.id })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching activity' });
  }
});

// ── PUT /api/workspaces/:id ─────────────────────────────────────────────────
router.put('/:id', requireWorkspaceRole('owner'), async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  const workspace = await Workspace.findByIdAndUpdate(
    req.params.id,
    { name, description },
    { new: true }
  );
  if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
  return res.json(workspace);
});

// ── DELETE /api/workspaces/:id ──────────────────────────────────────────────
router.delete('/:id', requireWorkspaceRole('owner'), async (req: AuthRequest, res: Response) => {
  await Workspace.findByIdAndDelete(req.params.id);
  return res.json({ message: 'Workspace deleted' });
});

// ── POST /api/workspaces/:id/members – Invite ───────────────────────────────
router.post(
  '/:id/members',
  requireWorkspaceRole('owner'),
  async (req: AuthRequest, res: Response) => {
    const { email, role } = req.body;
    if (!email || !role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'User identifier and valid role required' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    // Inviting admin cannot assign role >= own role (unless owner)
    const inviterMember = workspace.members.find(
      (m) => String(m.userId) === String(req.user!._id)
    );
    const inviterRole = inviterMember?.role ?? 'viewer';
    if (!req.user?.isSuperAdmin && ROLE_RANK[role as UserRole] >= ROLE_RANK[inviterRole] && inviterRole !== 'owner') {
      return res.status(403).json({ message: 'Cannot assign role equal or higher than your own' });
    }

    const queryStr = email.toLowerCase();
    const targetUser = await User.findOne({ 
      $or: [
        { email: queryStr },
        { name: { $regex: new RegExp(`^${email}$`, 'i') } }
      ]
    });
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const alreadyMember = workspace.members.some(
      (m) => String(m.userId) === String(targetUser._id)
    );
    if (alreadyMember) {
      return res.status(409).json({ message: 'User already a member' });
    }

    workspace.members.push({
      userId: targetUser._id as mongoose.Types.ObjectId,
      role: role as UserRole,
      joinedAt: new Date(),
      invitedBy: req.user!._id as mongoose.Types.ObjectId,
    });
    await workspace.save();

    return res.status(201).json({ message: 'Member added', member: { userId: targetUser._id, role } });
  }
);

// ── PUT /api/workspaces/:id/members/:userId – Change role ───────────────────
router.put(
  '/:id/members/:userId',
  requireWorkspaceRole('owner'),
  async (req: AuthRequest, res: Response) => {
    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Valid role required' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const member = workspace.members.find(
      (m) => String(m.userId) === req.params.userId
    );
    if (!member) return res.status(404).json({ message: 'Member not found' });

    // Cannot change owner role unless you are owner
    const editorMember = workspace.members.find(
      (m) => String(m.userId) === String(req.user!._id)
    );
    const editorRole = editorMember?.role ?? 'viewer';
    if (member.role === 'owner' && editorRole !== 'owner') {
      return res.status(403).json({ message: 'Cannot change owner role' });
    }

    member.role = role as UserRole;
    await workspace.save();

    return res.json({ message: 'Role updated', userId: req.params.userId, role });
  }
);

// ── DELETE /api/workspaces/:id/members/:userId – Remove ─────────────────────
router.delete(
  '/:id/members/:userId',
  requireWorkspaceRole('owner'),
  async (req: AuthRequest, res: Response) => {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const memberIndex = workspace.members.findIndex(
      (m) => String(m.userId) === req.params.userId
    );
    if (memberIndex === -1) return res.status(404).json({ message: 'Member not found' });

    const targetRole = workspace.members[memberIndex].role;
    if (targetRole === 'owner') {
      return res.status(403).json({ message: 'Cannot remove workspace owner' });
    }

    workspace.members.splice(memberIndex, 1);
    await workspace.save();

    return res.json({ message: 'Member removed' });
  }
);

export default router;

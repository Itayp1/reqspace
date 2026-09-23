"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const Workspace_1 = require("../models/Workspace");
const User_1 = require("../models/User");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const VALID_ROLES = ['viewer', 'editor', 'owner'];
const ROLE_RANK = {
    viewer: 1, editor: 2, owner: 3,
};
// ── GET /api/workspaces ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    const userId = req.user._id;
    const workspaces = await Workspace_1.Workspace.find({
        'members.userId': userId,
    }).lean();
    const result = workspaces.map((ws) => {
        const member = ws.members.find((m) => String(m.userId) === String(userId));
        return { ...ws, myRole: member?.role };
    });
    return res.json(result);
});
// ── POST /api/workspaces ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { name, description, isPublic } = req.body;
    if (!name)
        return res.status(400).json({ message: 'name is required' });
    const user = req.user;
    const workspace = await Workspace_1.Workspace.create({
        name,
        description,
        isPublic: isPublic || false,
        ownerId: user._id,
        members: [{ userId: user._id, role: 'owner', joinedAt: new Date() }],
    });
    const { EnvironmentRepository } = await Promise.resolve().then(() => __importStar(require('../repositories/EnvironmentRepository')));
    await EnvironmentRepository.upsertGlobal(String(workspace._id), []);
    return res.status(201).json(workspace);
});
// ── GET /api/workspaces/:id ─────────────────────────────────────────────────
router.get('/:id', (0, rbac_1.requireWorkspaceRole)('viewer'), async (req, res) => {
    const workspace = await Workspace_1.Workspace.findById(req.params.id)
        .populate('members.userId', 'name email avatar')
        .lean();
    if (!workspace)
        return res.status(404).json({ message: 'Workspace not found' });
    return res.json(workspace);
});
router.get('/:id/activity', (0, rbac_1.requireWorkspaceRole)('viewer'), async (req, res) => {
    try {
        const { AuditLog } = await Promise.resolve().then(() => __importStar(require('../models/AuditLog')));
        const logs = await AuditLog.find({ targetId: req.params.id })
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(logs);
    }
    catch (err) {
        res.status(500).json({ message: 'Error fetching activity' });
    }
});
// ── PUT /api/workspaces/:id ─────────────────────────────────────────────────
router.put('/:id', (0, rbac_1.requireWorkspaceRole)('owner'), async (req, res) => {
    const { name, description } = req.body;
    const workspace = await Workspace_1.Workspace.findByIdAndUpdate(req.params.id, { name, description }, { new: true });
    if (!workspace)
        return res.status(404).json({ message: 'Workspace not found' });
    return res.json(workspace);
});
// ── DELETE /api/workspaces/:id ──────────────────────────────────────────────
router.delete('/:id', (0, rbac_1.requireWorkspaceRole)('owner'), async (req, res) => {
    await Workspace_1.Workspace.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Workspace deleted' });
});
// ── POST /api/workspaces/:id/members – Invite ───────────────────────────────
router.post('/:id/members', (0, rbac_1.requireWorkspaceRole)('owner'), async (req, res) => {
    const { email, role } = req.body;
    if (!email || !role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: 'User identifier and valid role required' });
    }
    const workspace = await Workspace_1.Workspace.findById(req.params.id);
    if (!workspace)
        return res.status(404).json({ message: 'Workspace not found' });
    // Inviting admin cannot assign role >= own role (unless owner)
    const inviterMember = workspace.members.find((m) => String(m.userId) === String(req.user._id));
    const inviterRole = inviterMember?.role ?? 'viewer';
    if (!req.user?.isSuperAdmin && ROLE_RANK[role] >= ROLE_RANK[inviterRole] && inviterRole !== 'owner') {
        return res.status(403).json({ message: 'Cannot assign role equal or higher than your own' });
    }
    const queryStr = email.toLowerCase();
    const targetUser = await User_1.User.findOne({
        $or: [
            { email: queryStr },
            { name: { $regex: new RegExp(`^${email}$`, 'i') } }
        ]
    });
    if (!targetUser)
        return res.status(404).json({ message: 'User not found' });
    const alreadyMember = workspace.members.some((m) => String(m.userId) === String(targetUser._id));
    if (alreadyMember) {
        return res.status(409).json({ message: 'User already a member' });
    }
    workspace.members.push({
        userId: targetUser._id,
        role: role,
        joinedAt: new Date(),
        invitedBy: req.user._id,
    });
    await workspace.save();
    return res.status(201).json({ message: 'Member added', member: { userId: targetUser._id, role } });
});
// ── PUT /api/workspaces/:id/members/:userId – Change role ───────────────────
router.put('/:id/members/:userId', (0, rbac_1.requireWorkspaceRole)('owner'), async (req, res) => {
    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: 'Valid role required' });
    }
    const workspace = await Workspace_1.Workspace.findById(req.params.id);
    if (!workspace)
        return res.status(404).json({ message: 'Workspace not found' });
    const member = workspace.members.find((m) => String(m.userId) === req.params.userId);
    if (!member)
        return res.status(404).json({ message: 'Member not found' });
    // Cannot change owner role unless you are owner
    const editorMember = workspace.members.find((m) => String(m.userId) === String(req.user._id));
    const editorRole = editorMember?.role ?? 'viewer';
    if (member.role === 'owner' && editorRole !== 'owner') {
        return res.status(403).json({ message: 'Cannot change owner role' });
    }
    member.role = role;
    await workspace.save();
    return res.json({ message: 'Role updated', userId: req.params.userId, role });
});
// ── DELETE /api/workspaces/:id/members/:userId – Remove ─────────────────────
router.delete('/:id/members/:userId', (0, rbac_1.requireWorkspaceRole)('owner'), async (req, res) => {
    const workspace = await Workspace_1.Workspace.findById(req.params.id);
    if (!workspace)
        return res.status(404).json({ message: 'Workspace not found' });
    const memberIndex = workspace.members.findIndex((m) => String(m.userId) === req.params.userId);
    if (memberIndex === -1)
        return res.status(404).json({ message: 'Member not found' });
    const targetRole = workspace.members[memberIndex].role;
    if (targetRole === 'owner') {
        return res.status(403).json({ message: 'Cannot remove workspace owner' });
    }
    workspace.members.splice(memberIndex, 1);
    await workspace.save();
    return res.json({ message: 'Member removed' });
});
exports.default = router;
//# sourceMappingURL=workspaces.js.map
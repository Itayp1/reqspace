"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const User_1 = require("../models/User");
const Workspace_1 = require("../models/Workspace");
const AuditLogRepository_1 = require("../repositories/AuditLogRepository");
const SystemConfigRepository_1 = require("../repositories/SystemConfigRepository");
const UserRepository_1 = require("../repositories/UserRepository");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, auth_1.requireSuperAdmin);
// ── GET /api/admin/users ────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    const { search, status, page = '1', limit = '50' } = req.query;
    const query = {};
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
        ];
    }
    if (status)
        query.status = status;
    const users = await User_1.User.find(query)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .lean();
    const total = await User_1.User.countDocuments(query);
    return res.json({ users, total, page: +page, limit: +limit });
});
// ── PUT /api/admin/users/:id ────────────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
    const { name, email, status, password } = req.body;
    const update = {};
    if (name)
        update.name = name;
    if (email)
        update.email = email.toLowerCase();
    if (status)
        update.status = status;
    if (password)
        update.passwordHash = await bcryptjs_1.default.hash(password, 12);
    const user = await User_1.User.findByIdAndUpdate(req.params.id, update, { new: true })
        .select('-passwordHash');
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    await (0, AuditLogRepository_1.logAudit)(req.user._id, 'admin.user.update', {
        targetType: 'User', targetId: user._id,
        ip: req.ip, details: { fields: Object.keys(update) },
    });
    return res.json(user);
});
// ── POST /api/admin/users ── Create User ──────────────────────────────────────
router.post('/users', async (req, res) => {
    const { name, email, password, isSuperAdmin } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    const existing = await User_1.User.findOne({ email: email.toLowerCase() });
    if (existing) {
        return res.status(409).json({ message: 'Email already registered' });
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    const user = await User_1.User.create({
        name,
        email: email.toLowerCase(),
        passwordHash,
        authType: 'password',
        isSuperAdmin: !!isSuperAdmin,
        mustChangePassword: true, // Force password change on first login
    });
    const { createPersonalWorkspace } = require('../middleware/auth');
    await createPersonalWorkspace(user);
    await (0, AuditLogRepository_1.logAudit)(req.user._id, 'user.create', {
        targetType: 'User', targetId: user._id, ip: req.ip,
    });
    return res.status(201).json({ message: 'User created successfully', user: { _id: user._id, name: user.name, email: user.email } });
});
// ── POST /api/admin/users/:id/promote – Set SuperAdmin ──────────────────────
router.post('/users/:id/promote', async (req, res) => {
    const user = await User_1.User.findByIdAndUpdate(req.params.id, { isSuperAdmin: true }, { new: true }).select('-passwordHash');
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    await (0, AuditLogRepository_1.logAudit)(req.user._id, 'user.promote', {
        targetType: 'User', targetId: user._id, ip: req.ip,
    });
    return res.json({ message: 'User promoted to SuperAdmin', user });
});
// ── POST /api/admin/users/:id/revoke – Remove SuperAdmin ────────────────────
router.post('/users/:id/revoke', async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) {
        return res.status(400).json({ message: 'Cannot revoke your own SuperAdmin privileges' });
    }
    const user = await User_1.User.findByIdAndUpdate(req.params.id, { isSuperAdmin: false }, { new: true }).select('-passwordHash');
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    await (0, AuditLogRepository_1.logAudit)(req.user._id, 'user.revoke', {
        targetType: 'User', targetId: user._id, ip: req.ip,
    });
    return res.json({ message: 'SuperAdmin revoked', user });
});
// ── POST /api/admin/users/:id/suspend ───────────────────────────────────────
router.post('/users/:id/suspend', async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) {
        return res.status(400).json({ message: 'Cannot suspend yourself' });
    }
    const user = await User_1.User.findByIdAndUpdate(req.params.id, { status: 'suspended' }, { new: true }).select('-passwordHash');
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    await (0, AuditLogRepository_1.logAudit)(req.user._id, 'user.suspend', {
        targetType: 'User', targetId: user._id, ip: req.ip,
    });
    return res.json({ message: 'User suspended', user });
});
// ── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) {
        return res.status(400).json({ message: 'Cannot delete yourself' });
    }
    const user = await User_1.User.findByIdAndDelete(req.params.id);
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    await (0, AuditLogRepository_1.logAudit)(req.user._id, 'user.delete', {
        targetType: 'User', targetId: user._id, ip: req.ip,
    });
    return res.json({ message: 'User deleted' });
});
// ── GET /api/admin/workspaces ───────────────────────────────────────────────
router.get('/workspaces', async (_req, res) => {
    const workspaces = await Workspace_1.Workspace.find()
        .populate('ownerId', 'name email')
        .lean();
    return res.json(workspaces);
});
// ── GET /api/admin/audit-logs ───────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
    const { action, userId, from, to, page = '1', limit = '100' } = req.query;
    const query = {};
    if (action)
        query.action = { $regex: action, $options: 'i' };
    if (userId)
        query.userId = new mongoose_1.default.Types.ObjectId(userId);
    if (from || to) {
        query.createdAt = {};
        if (from)
            query.createdAt.$gte = new Date(from);
        if (to)
            query.createdAt.$lte = new Date(to);
    }
    const skip = (+page - 1) * +limit;
    const logs = await AuditLogRepository_1.AuditLogRepository.list(query, +limit, skip);
    const total = await AuditLogRepository_1.AuditLogRepository.count(query);
    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = await Promise.all(userIds.map(id => UserRepository_1.UserRepository.findById(id)));
    const userMap = Object.fromEntries(users.filter(Boolean).map((u) => [u.id || u._id.toString(), { _id: u.id || u._id.toString(), name: u.name, email: u.email }]));
    const populatedLogs = logs.map(l => ({
        ...l,
        userId: userMap[l.userId] || l.userId
    }));
    return res.json({ logs: populatedLogs, total });
});
// ── GET /api/admin/config ───────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
    const config = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
    return res.json(config);
});
// ── PUT /api/admin/config ───────────────────────────────────────────────────
router.put('/config', async (req, res) => {
    const { auth, history } = req.body;
    const config = await SystemConfigRepository_1.SystemConfigRepository.updateConfig(req.body);
    await (0, AuditLogRepository_1.logAudit)(req.user._id, 'admin.config.update', {
        ip: req.ip, details: req.body,
    });
    return res.json(config);
});
exports.default = router;
//# sourceMappingURL=admin.js.map
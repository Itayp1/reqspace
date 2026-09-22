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
const WorkspaceRepository_1 = require("../repositories/WorkspaceRepository");
const Collection_1 = require("../models/Collection");
const Folder_1 = require("../models/Folder");
const Request_1 = require("../models/Request");
const Environment_1 = require("../models/Environment");
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
// ── POST /api/admin/test-smtp ──────────────────────────────────────
router.post('/test-smtp', async (req, res) => {
    const { host, port, user, pass, fromAddress } = req.body;
    if (!host || !port)
        return res.status(400).json({ message: 'Host and port are required' });
    try {
        const nodemailer = await Promise.resolve().then(() => __importStar(require('nodemailer')));
        const transporter = nodemailer.createTransport({
            host,
            port: Number(port),
            secure: Number(port) === 465,
            auth: user && pass ? { user, pass } : undefined,
        });
        await transporter.verify();
        // Optionally send a test email to the admin
        await transporter.sendMail({
            from: fromAddress || 'noreply@reqspace.com',
            to: req.user.email,
            subject: 'Reqspace SMTP Test',
            text: 'This is a test email from your Reqspace system to verify SMTP settings are working correctly.',
        });
        return res.json({ message: 'SMTP connection successful and test email sent!' });
    }
    catch (err) {
        return res.status(500).json({ message: 'SMTP Error: ' + err.message });
    }
});
// ── GET /api/admin/export/:workspaceId ──────────────────────────────
router.get('/export/:workspaceId', async (req, res) => {
    try {
        const workspaceId = req.params.workspaceId;
        const workspace = await WorkspaceRepository_1.WorkspaceRepository.findById(workspaceId);
        if (!workspace)
            return res.status(404).json({ message: 'Workspace not found' });
        const collections = await Collection_1.Collection.find({ workspaceId }).lean();
        const folders = await Folder_1.Folder.find({ workspaceId }).lean();
        const requests = await Request_1.Request.find({ workspaceId }).lean();
        const environments = await Environment_1.Environment.find({ workspaceId }).lean();
        const config = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
        const dump = {
            workspace,
            collections,
            folders,
            requests,
            environments,
            config
        };
        await (0, AuditLogRepository_1.logAudit)(req.user._id, 'admin.export', { ip: req.ip, targetId: workspaceId });
        // Set headers to trigger a download of the JSON file
        res.setHeader('Content-disposition', `attachment; filename=reqspace-export-${workspaceId}-${new Date().toISOString().split('T')[0]}.json`);
        res.setHeader('Content-type', 'application/json');
        return res.send(JSON.stringify(dump, null, 2));
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
// ── POST /api/admin/import/:workspaceId ─────────────────────────────
router.post('/import/:workspaceId', async (req, res) => {
    try {
        const workspaceId = req.params.workspaceId;
        const dump = req.body;
        // In a real scenario we should validate and insert. 
        // Since this is a dump, we can insert collections, folders, requests, environments, globals.
        if (dump.collections)
            await Collection_1.Collection.insertMany(dump.collections.map((c) => ({ ...c, workspaceId, _id: undefined })));
        if (dump.folders)
            await Folder_1.Folder.insertMany(dump.folders.map((f) => ({ ...f, workspaceId, _id: undefined })));
        if (dump.requests)
            await Request_1.Request.insertMany(dump.requests.map((r) => ({ ...r, workspaceId, _id: undefined })));
        if (dump.environments)
            await Environment_1.Environment.insertMany(dump.environments.map((e) => ({ ...e, workspaceId, _id: undefined })));
        if (dump.config) {
            await SystemConfigRepository_1.SystemConfigRepository.updateConfig(dump.config);
        }
        await (0, AuditLogRepository_1.logAudit)(req.user._id, 'admin.import', { ip: req.ip, targetId: workspaceId });
        return res.json({ message: 'Import successful' });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map
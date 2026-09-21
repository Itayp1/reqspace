"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const Environment_1 = require("../models/Environment");
const router = (0, express_1.Router)();
async function checkEnvPermission(req, res, next) {
    if (req.user?.isSuperAdmin)
        return next();
    try {
        const item = await Environment_1.Environment.findById(req.params.id);
        if (!item)
            return res.status(404).json({ message: 'Environment not found' });
        req.params.workspaceId = String(item.workspaceId);
        return (0, rbac_1.requireWorkspaceRole)('editor')(req, res, next);
    }
    catch (e) {
        next(e);
    }
}
router.use(auth_1.authenticate);
// ── GET /api/workspaces/:workspaceId/environments ───────────────────────────
router.get('/workspaces/:workspaceId/environments', (0, rbac_1.requireWorkspaceRole)('viewer'), async (req, res) => {
    const envs = await Environment_1.Environment.find({
        workspaceId: req.params.workspaceId,
    }).sort({ isGlobal: -1, createdAt: 1 }).lean();
    return res.json(envs);
});
// ── POST /api/workspaces/:workspaceId/environments ──────────────────────────
router.post('/workspaces/:workspaceId/environments', (0, rbac_1.requireWorkspaceRole)('editor'), async (req, res) => {
    const { name, isGlobal, variables } = req.body;
    if (!name)
        return res.status(400).json({ message: 'name required' });
    const env = await Environment_1.Environment.create({
        workspaceId: req.params.workspaceId,
        name, isGlobal: isGlobal ?? false,
        variables: variables ?? [],
        createdBy: req.user._id,
    });
    return res.status(201).json(env);
});
// ── GET /api/environments/:id ───────────────────────────────────────────────
router.get('/environments/:id', async (req, res) => {
    const env = await Environment_1.Environment.findById(req.params.id).lean();
    if (!env)
        return res.status(404).json({ message: 'Environment not found' });
    return res.json(env);
});
// ── PUT /api/environments/:id ───────────────────────────────────────────────
router.put('/environments/:id', checkEnvPermission, async (req, res) => {
    const env = await Environment_1.Environment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!env)
        return res.status(404).json({ message: 'Environment not found' });
    return res.json(env);
});
// ── DELETE /api/environments/:id ────────────────────────────────────────────
router.delete('/environments/:id', checkEnvPermission, async (req, res) => {
    await Environment_1.Environment.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Environment deleted' });
});
// ── POST /api/environments/:id/duplicate ────────────────────────────────────
router.post('/environments/:id/duplicate', checkEnvPermission, async (req, res) => {
    const env = await Environment_1.Environment.findById(req.params.id).lean();
    if (!env)
        return res.status(404).json({ message: 'Environment not found' });
    // If a target workspace is provided, verify the user has access to it
    const targetWorkspaceId = req.body.workspaceId || env.workspaceId;
    if (req.body.workspaceId && req.body.workspaceId !== String(env.workspaceId)) {
        const Workspace = require('../models/Workspace').Workspace;
        const targetWs = await Workspace.findById(targetWorkspaceId);
        if (!targetWs)
            return res.status(404).json({ message: 'Target workspace not found' });
        const member = targetWs.members.find((m) => String(m.userId) === String(req.user._id));
        if (!member && !req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'No access to target workspace' });
        }
        if (member && member.role === 'viewer') {
            return res.status(403).json({ message: 'Viewers cannot create environments in the target workspace' });
        }
    }
    const { _id, ...data } = env;
    const duplicate = await Environment_1.Environment.create({
        ...data,
        workspaceId: targetWorkspaceId,
        name: `${env.name} (copy)`,
        createdBy: req.user._id,
    });
    return res.status(201).json(duplicate);
});
exports.default = router;
//# sourceMappingURL=environments.js.map
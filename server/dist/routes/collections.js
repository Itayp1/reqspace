"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const Collection_1 = require("../models/Collection");
const Folder_1 = require("../models/Folder");
const Request_1 = require("../models/Request");
const AuditLogRepository_1 = require("../repositories/AuditLogRepository");
const router = (0, express_1.Router)();
async function checkPermissionByItem(req, res, next, Model, minRole) {
    if (req.user?.isSuperAdmin)
        return next();
    try {
        const item = await Model.findById(req.params.id || req.params.collectionId);
        if (!item)
            return res.status(404).json({ message: 'Item not found' });
        let workspaceId = item.workspaceId;
        if (!workspaceId && item.collectionId) {
            const coll = await Collection_1.Collection.findById(item.collectionId);
            if (coll)
                workspaceId = coll.workspaceId;
        }
        if (!workspaceId)
            return res.status(400).json({ message: 'No workspace attached' });
        req.params.workspaceId = String(workspaceId);
        return (0, rbac_1.requireWorkspaceRole)(minRole)(req, res, next);
    }
    catch (e) {
        next(e);
    }
}
router.use(auth_1.authenticate);
// ── Collections ─────────────────────────────────────────────────────────────
router.get('/workspaces/:workspaceId/collections', (0, rbac_1.requireWorkspaceRole)('viewer'), async (req, res) => {
    const collections = await Collection_1.Collection.find({ workspaceId: req.params.workspaceId })
        .sort({ order: 1 }).lean();
    return res.json(collections);
});
router.post('/workspaces/:workspaceId/collections', (0, rbac_1.requireWorkspaceRole)('editor'), async (req, res) => {
    const { name, description, variables, preRequestScript, testScript } = req.body;
    if (!name)
        return res.status(400).json({ message: 'name required' });
    const count = await Collection_1.Collection.countDocuments({ workspaceId: req.params.workspaceId });
    const collection = await Collection_1.Collection.create({
        workspaceId: req.params.workspaceId,
        name, description, variables, preRequestScript, testScript,
        order: count,
        createdBy: req.user._id,
    });
    return res.status(201).json(collection);
});
router.put('/collections/:id', (req, res, next) => checkPermissionByItem(req, res, next, Collection_1.Collection, 'editor'), async (req, res) => {
    const collection = await Collection_1.Collection.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.json(collection);
});
router.delete('/collections/:id', (req, res, next) => checkPermissionByItem(req, res, next, Collection_1.Collection, 'editor'), async (req, res) => {
    await Folder_1.Folder.deleteMany({ collectionId: req.params.id });
    await Request_1.Request.deleteMany({ collectionId: req.params.id });
    await Collection_1.Collection.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Collection deleted' });
});
// ── Folders ──────────────────────────────────────────────────────────────────
router.get('/collections/:collectionId/folders', async (req, res) => {
    const folders = await Folder_1.Folder.find({ collectionId: req.params.collectionId })
        .sort({ order: 1 }).lean();
    return res.json(folders);
});
router.post('/collections/:collectionId/folders', async (req, res) => {
    const { name, parentFolderId, description, preRequestScript, testScript } = req.body;
    if (!name)
        return res.status(400).json({ message: 'name required' });
    const count = await Folder_1.Folder.countDocuments({
        collectionId: req.params.collectionId,
        parentFolderId: parentFolderId ?? null,
    });
    const folder = await Folder_1.Folder.create({
        collectionId: req.params.collectionId,
        parentFolderId: parentFolderId ?? null,
        name, description, preRequestScript, testScript, order: count,
    });
    return res.status(201).json(folder);
});
router.put('/folders/:id', (req, res, next) => checkPermissionByItem(req, res, next, Folder_1.Folder, 'editor'), async (req, res) => {
    const folder = await Folder_1.Folder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!folder)
        return res.status(404).json({ message: 'Folder not found' });
    return res.json(folder);
});
router.delete('/folders/:id', (req, res, next) => checkPermissionByItem(req, res, next, Folder_1.Folder, 'editor'), async (req, res) => {
    await Folder_1.Folder.deleteMany({ parentFolderId: req.params.id });
    await Request_1.Request.deleteMany({ folderId: req.params.id });
    await Folder_1.Folder.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Folder deleted' });
});
// ── Requests ─────────────────────────────────────────────────────────────────
router.get('/collections/:collectionId/requests', async (req, res) => {
    const filter = { collectionId: req.params.collectionId };
    if (req.query.folderId !== undefined) {
        filter.folderId = req.query.folderId === 'null' ? null : req.query.folderId;
    }
    const requests = await Request_1.Request.find(filter).sort({ order: 1 }).lean();
    return res.json(requests);
});
router.post('/collections/:collectionId/requests', async (req, res) => {
    const count = await Request_1.Request.countDocuments({
        collectionId: req.params.collectionId,
        folderId: req.body.folderId ?? null,
    });
    const request = await Request_1.Request.create({
        ...req.body,
        collectionId: req.params.collectionId,
        order: count,
        createdBy: req.user._id,
    });
    const col = await Collection_1.Collection.findById(req.params.collectionId).lean();
    if (col) {
        (0, AuditLogRepository_1.logAudit)(req.user._id, 'create_request', {
            targetType: 'Request',
            targetId: request._id,
            details: { requestId: request._id, requestName: request.name }
        }).catch(() => { });
    }
    return res.status(201).json(request);
});
router.get('/requests/:id', async (req, res) => {
    const request = await Request_1.Request.findById(req.params.id).lean();
    if (!request)
        return res.status(404).json({ message: 'Request not found' });
    return res.json(request);
});
router.put('/requests/:id', (req, res, next) => checkPermissionByItem(req, res, next, Request_1.Request, 'editor'), async (req, res) => {
    const request = await Request_1.Request.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!request)
        return res.status(404).json({ message: 'Request not found' });
    return res.json(request);
});
router.delete('/requests/:id', (req, res, next) => checkPermissionByItem(req, res, next, Request_1.Request, 'editor'), async (req, res) => {
    await Request_1.Request.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Request deleted' });
});
// ── POST /api/requests/:id/comments ───────────────────────────────────────
router.post('/requests/:id/comments', (req, res, next) => checkPermissionByItem(req, res, next, Request_1.Request, 'viewer'), async (req, res) => {
    try {
        const { text } = req.body;
        if (!text)
            return res.status(400).json({ message: 'Text is required' });
        const request = await Request_1.Request.findById(req.params.id);
        if (!request)
            return res.status(404).json({ message: 'Request not found' });
        request.comments.push({
            userId: req.user._id,
            text,
            createdAt: new Date()
        });
        await request.save();
        return res.json(request);
    }
    catch (err) {
        return res.status(500).json({ message: 'Server error' });
    }
});
// ── DELETE /api/requests/:id/comments/:commentId ──────────────────────────
router.delete('/requests/:id/comments/:commentId', (req, res, next) => checkPermissionByItem(req, res, next, Request_1.Request, 'viewer'), async (req, res) => {
    try {
        const request = await Request_1.Request.findById(req.params.id);
        if (!request)
            return res.status(404).json({ message: 'Request not found' });
        request.comments = request.comments.filter((c) => c._id?.toString() !== req.params.commentId);
        await request.save();
        res.json(request);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Reorder ─────────────────────────────────────────────────────────────────
router.put('/reorder', async (req, res) => {
    const { type, items } = req.body;
    const ModelMap = {
        collection: Collection_1.Collection,
        folder: Folder_1.Folder,
        request: Request_1.Request,
    };
    const Model = ModelMap[type];
    if (!Model)
        return res.status(400).json({ message: 'Invalid type' });
    await Promise.all(items.map(({ id, order }) => Model.findByIdAndUpdate(id, { order })));
    return res.json({ message: 'Reordered' });
});
exports.default = router;
//# sourceMappingURL=collections.js.map
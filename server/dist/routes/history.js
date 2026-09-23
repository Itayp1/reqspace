"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveHistoryEntry = saveHistoryEntry;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const History_1 = require("../models/History");
const User_1 = require("../models/User");
const SystemConfig_1 = require("../models/SystemConfig");
const Request_1 = require("../models/Request");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ── GET /api/workspaces/:workspaceId/history ────────────────────────────────
router.get('/workspaces/:workspaceId/history', async (req, res) => {
    const { method, status, page = '1', limit = '50' } = req.query;
    const query = {
        userId: req.user._id,
        workspaceId: req.params.workspaceId,
    };
    if (method)
        query['requestSnapshot.method'] = method.toUpperCase();
    if (status)
        query['responseSnapshot.status'] = +status;
    const items = await History_1.History.find(query)
        .sort({ executedAt: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .lean();
    const total = await History_1.History.countDocuments(query);
    return res.json({ items, total });
});
// ── GET /api/history/:id ────────────────────────────────────────────────────
router.get('/history/:id', async (req, res) => {
    const item = await History_1.History.findOne({
        _id: req.params.id,
        userId: req.user._id,
    }).lean();
    if (!item)
        return res.status(404).json({ message: 'Not found' });
    return res.json(item);
});
// ── DELETE /api/history/:id ─────────────────────────────────────────────────
router.delete('/history/:id', async (req, res) => {
    const item = await History_1.History.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id,
    });
    if (!item)
        return res.status(404).json({ message: 'Not found' });
    const bodySize = Buffer.byteLength(item.responseSnapshot?.body ?? '', 'utf8');
    await User_1.User.findByIdAndUpdate(req.user._id, {
        $inc: { historyUsedBytes: -bodySize },
    });
    return res.json({ message: 'Deleted' });
});
// ── DELETE /api/history ─ Clear all history for user ──────────────────
router.delete('/history', async (req, res) => {
    await History_1.History.deleteMany({ userId: req.user._id });
    await User_1.User.findByIdAndUpdate(req.user._id, { historyUsedBytes: 0 });
    return res.json({ message: 'All history cleared' });
});
// ── DELETE /api/workspaces/:workspaceId/history – Clear all ─────────────────
router.delete('/workspaces/:workspaceId/history', async (req, res) => {
    await History_1.History.deleteMany({ userId: req.user._id, workspaceId: req.params.workspaceId });
    await User_1.User.findByIdAndUpdate(req.user._id, { historyUsedBytes: 0 });
    return res.json({ message: 'History cleared' });
});
// ── POST /api/history/:id/save – Save to Collection ─────────────────────────
router.post('/history/:id/save', async (req, res) => {
    const item = await History_1.History.findOne({
        _id: req.params.id,
        userId: req.user._id,
    }).lean();
    if (!item)
        return res.status(404).json({ message: 'Not found' });
    const { collectionId, folderId, name } = req.body;
    if (!collectionId)
        return res.status(400).json({ message: 'collectionId required' });
    const count = await Request_1.Request.countDocuments({ collectionId, folderId: folderId ?? null });
    const request = await Request_1.Request.create({
        collectionId,
        folderId: folderId ?? null,
        name: name || item.requestSnapshot.url,
        method: item.requestSnapshot.method,
        url: item.requestSnapshot.url,
        headers: Object.entries(item.requestSnapshot.headers ?? {}).map(([key, value]) => ({
            key, value, enabled: true,
        })),
        params: item.requestSnapshot.params ?? [],
        body: { mode: 'raw', raw: item.requestSnapshot.body ?? '' },
        order: count,
        createdBy: req.user._id,
    });
    return res.status(201).json(request);
});
exports.default = router;
// ─── History GC Service ─────────────────────────────────────────────────────
async function saveHistoryEntry(userId, workspaceId, data) {
    const user = await User_1.User.findById(userId);
    if (!user?.settings?.saveHistory)
        return;
    const config = await SystemConfig_1.SystemConfig.findById('global');
    const maxBodyKB = (config?.history.maxRequestBodyKB ?? 10) * 1024;
    const maxTotalMB = (config?.history.maxTotalPerUserMB ?? 20) * 1024 * 1024;
    let body = data.responseBody;
    let bodyTruncated = false;
    if (Buffer.byteLength(body, 'utf8') > maxBodyKB) {
        body = body.substring(0, maxBodyKB) + '... [truncated]';
        bodyTruncated = true;
    }
    const bodySize = Buffer.byteLength(body, 'utf8');
    // GC: remove oldest entries if over limit
    let usedBytes = user.historyUsedBytes ?? 0;
    while (usedBytes + bodySize > maxTotalMB) {
        const oldest = await History_1.History.findOne({ userId }).sort({ executedAt: 1 });
        if (!oldest)
            break;
        const oldSize = Buffer.byteLength(oldest.responseSnapshot?.body ?? '', 'utf8');
        await History_1.History.findByIdAndDelete(oldest._id);
        usedBytes -= oldSize;
    }
    await History_1.History.create({
        userId,
        workspaceId,
        requestSnapshot: data.requestSnapshot,
        responseSnapshot: {
            status: data.responseStatus,
            statusText: data.responseStatusText,
            headers: data.responseHeaders,
            body,
            bodyTruncated,
            responseTime: data.responseTime,
            size: data.responseSize,
        },
        testResults: data.testResults,
        executedAt: new Date(),
    });
    await User_1.User.findByIdAndUpdate(userId, {
        historyUsedBytes: Math.max(0, usedBytes + bodySize),
    });
}
//# sourceMappingURL=history.js.map
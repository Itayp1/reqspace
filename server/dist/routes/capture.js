"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Collection_1 = require("../models/Collection");
const Request_1 = require("../models/Request");
const index_1 = require("../index");
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
// ── ALL /api/capture/:workspaceId/* ──────────────────────────────────────────
router.all('/:workspaceId/*', async (req, res) => {
    const workspaceId = req.params.workspaceId;
    const targetPath = req.params[0];
    if (!mongoose_1.default.Types.ObjectId.isValid(workspaceId)) {
        return res.status(400).json({ message: 'Invalid workspace ID' });
    }
    try {
        // 1. Find or create the "Captured Requests" collection
        let collection = await Collection_1.Collection.findOne({ workspaceId, name: 'Captured Requests' });
        if (!collection) {
            collection = new Collection_1.Collection({
                workspaceId,
                name: 'Captured Requests',
                description: 'Automatically captured proxy requests',
            });
            await collection.save();
        }
        // 2. Extract target URL from path or header
        const headerTarget = req.headers['x-target-url'];
        let targetUrl = Array.isArray(headerTarget) ? headerTarget[0] : headerTarget;
        if (!targetUrl && targetPath) {
            // If path looks like a URL without protocol
            if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
                targetUrl = targetPath;
            }
            else {
                targetUrl = `https://${targetPath}`;
            }
        }
        // Include query parameters in target URL
        const queryString = Object.keys(req.query).length > 0
            ? '?' + new URLSearchParams(req.query).toString()
            : '';
        const finalUrl = (targetUrl || '') + queryString;
        // 3. Construct Headers for DB
        const headers = [];
        for (const [key, value] of Object.entries(req.headers)) {
            if (key.toLowerCase() === 'x-target-url')
                continue;
            if (key.toLowerCase() === 'host')
                continue;
            if (Array.isArray(value)) {
                headers.push({ key, value: value.join(', '), enabled: true });
            }
            else if (value) {
                headers.push({ key, value: value.toString(), enabled: true });
            }
        }
        // 4. Construct Body for DB
        let requestBody = { mode: 'none' };
        const contentType = req.headers['content-type'] || '';
        if (Object.keys(req.body || {}).length > 0 || (req.body && typeof req.body === 'string')) {
            if (contentType.includes('application/json')) {
                requestBody = { mode: 'raw', rawLanguage: 'json', raw: JSON.stringify(req.body, null, 2) };
            }
            else if (contentType.includes('application/x-www-form-urlencoded')) {
                const items = [];
                for (const [key, value] of Object.entries(req.body)) {
                    items.push({ key, value: String(value), enabled: true });
                }
                requestBody = { mode: 'urlencoded', urlencoded: items };
            }
            else {
                requestBody = { mode: 'raw', rawLanguage: 'text', raw: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) };
            }
        }
        // 5. Create Request Document
        const newRequest = new Request_1.Request({
            collectionId: collection._id,
            name: `Captured: ${req.method} ${targetUrl ? new URL(finalUrl).hostname : finalUrl || 'Unknown'}`,
            method: req.method,
            url: finalUrl,
            headers,
            body: requestBody,
        });
        await newRequest.save();
        // 6. Notify connected clients
        index_1.io.to(`workspace:${workspaceId}`).emit('collection:update', {
            action: 'create-request',
            data: newRequest
        });
        // We also might want to notify about the collection if we created it
        index_1.io.to(`workspace:${workspaceId}`).emit('collection:update', {
            action: 'create',
            data: collection
        });
        // 7. Forward request if target is known
        if (finalUrl) {
            try {
                const outHeaders = new Headers(req.headers);
                outHeaders.delete('host');
                outHeaders.delete('x-target-url');
                const fetchOptions = {
                    method: req.method,
                    headers: outHeaders,
                };
                if (!['GET', 'HEAD'].includes(req.method) && requestBody.mode !== 'none') {
                    fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
                }
                const response = await fetch(finalUrl, fetchOptions);
                const responseBody = await response.text();
                // Forward status and headers
                res.status(response.status);
                response.headers.forEach((val, key) => {
                    try {
                        res.setHeader(key, val);
                    }
                    catch (e) { }
                });
                return res.send(responseBody);
            }
            catch (err) {
                return res.status(502).json({ error: 'Proxy forwarding failed', details: err.message, capturedId: newRequest._id });
            }
        }
        else {
            return res.status(200).json({ message: 'Request captured successfully (no target to forward)', capturedId: newRequest._id });
        }
    }
    catch (err) {
        console.error('Capture error:', err);
        return res.status(500).json({ message: 'Error capturing request', error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=capture.js.map
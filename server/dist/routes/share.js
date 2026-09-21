"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SharedLink_1 = require("../models/SharedLink");
const Collection_1 = require("../models/Collection");
const Request_1 = require("../models/Request");
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ?? GET /api/share/:shortId (PUBLIC) ??
router.get('/:shortId', async (req, res) => {
    const link = await SharedLink_1.SharedLink.findOne({ shortId: req.params.shortId });
    if (!link) {
        return res.status(404).json({ message: 'Link not found or expired' });
    }
    if (link.expiresAt < new Date()) {
        return res.status(404).json({ message: 'Link expired' });
    }
    // Fetch the collection and its requests
    const collection = await Collection_1.Collection.findById(link.collectionId).lean();
    if (!collection) {
        return res.status(404).json({ message: 'Collection not found' });
    }
    const requests = await Request_1.Request.find({ collectionId: collection._id }).lean();
    return res.json({
        collection,
        requests,
        expiresAt: link.expiresAt
    });
});
// ?? POST /api/share/collection/:id (AUTHENTICATED) ??
router.post('/collection/:id', auth_1.authenticate, async (req, res) => {
    const { expiresInDays } = req.body;
    const days = parseInt(expiresInDays) || 7;
    const collection = await Collection_1.Collection.findById(req.params.id);
    if (!collection) {
        return res.status(404).json({ message: 'Collection not found' });
    }
    const shortId = crypto_1.default.randomBytes(6).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const link = await SharedLink_1.SharedLink.create({
        shortId,
        collectionId: collection._id,
        workspaceId: collection.workspaceId,
        createdBy: req.user._id,
        expiresAt
    });
    return res.json({
        shortId: link.shortId,
        expiresAt: link.expiresAt,
        url: '/share/' + link.shortId
    });
});
exports.default = router;
//# sourceMappingURL=share.js.map
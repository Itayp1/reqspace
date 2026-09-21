"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const User_1 = require("../models/User");
const router = (0, express_1.Router)();
router.get('/search', auth_1.authenticate, async (req, res) => {
    const q = req.query.q;
    if (!q || q.length < 2) {
        return res.json([]);
    }
    const regex = new RegExp(q, 'i');
    const users = await User_1.User.find({
        $or: [{ name: regex }, { email: regex }]
    }).select('_id name email avatar').limit(10);
    res.json(users);
});
exports.default = router;
//# sourceMappingURL=users.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.post('/runner/run', async (req, res) => {
    // Trigger runner via websockets
    res.json({ message: 'Run started (stub)' });
});
exports.default = router;
//# sourceMappingURL=runner.js.map
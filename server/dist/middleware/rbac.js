"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserWorkspaceRole = getUserWorkspaceRole;
exports.requireWorkspaceRole = requireWorkspaceRole;
exports.canSave = canSave;
exports.canRun = canRun;
exports.canManageMembers = canManageMembers;
const Workspace_1 = require("../models/Workspace");
const mongoose_1 = __importDefault(require("mongoose"));
const ROLE_RANK = {
    viewer: 1,
    editor: 2,
    owner: 3,
};
/** Get user's role in a workspace */
async function getUserWorkspaceRole(userId, workspaceId) {
    const workspace = await Workspace_1.Workspace.findById(workspaceId);
    if (!workspace)
        return null;
    // SuperAdmin always treated as owner
    const member = workspace.members.find((m) => String(m.userId) === String(userId));
    if (member)
        return member.role;
    if (workspace.isPublic)
        return 'viewer';
    return null;
}
/**
 * Middleware factory: requires at least `minRole` in the workspace.
 * workspaceId is read from req.params.workspaceId or req.params.id
 */
function requireWorkspaceRole(minRole) {
    return async (req, res, next) => {
        try {
            if (!req.user)
                return res.status(401).json({ message: 'Not authenticated' });
            // SuperAdmin bypasses all workspace role checks
            if (req.user.isSuperAdmin)
                return next();
            const workspaceId = req.params.workspaceId || req.params.id || req.body.workspaceId;
            if (!workspaceId || !mongoose_1.default.isValidObjectId(workspaceId)) {
                return res.status(400).json({ message: 'Invalid workspace ID' });
            }
            const role = await getUserWorkspaceRole(String(req.user._id), workspaceId);
            if (!role) {
                return res.status(403).json({ message: 'Access denied: not a workspace member' });
            }
            if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
                return res.status(403).json({
                    message: `Requires ${minRole} role (your role: ${role})`,
                });
            }
            // Attach role to request for downstream use
            req.workspaceRole = role;
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
function canSave(role) {
    return ROLE_RANK[role] >= ROLE_RANK['editor'];
}
function canRun(role) {
    return ROLE_RANK[role] >= ROLE_RANK['viewer'];
}
function canManageMembers(role) {
    return ROLE_RANK[role] >= ROLE_RANK['owner'];
}
//# sourceMappingURL=rbac.js.map
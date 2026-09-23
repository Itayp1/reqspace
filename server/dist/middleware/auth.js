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
exports.signToken = signToken;
exports.setCookieToken = setCookieToken;
exports.createPersonalWorkspace = createPersonalWorkspace;
exports.authenticate = authenticate;
exports.requireSuperAdmin = requireSuperAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const SystemConfigRepository_1 = require("../repositories/SystemConfigRepository");
const WorkspaceRepository_1 = require("../repositories/WorkspaceRepository");
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
function signToken(userId, ttlDays) {
    return jsonwebtoken_1.default.sign({ sub: userId }, JWT_SECRET, {
        expiresIn: `${ttlDays}d`,
    });
}
function setCookieToken(res, token, ttlDays) {
    res.cookie('token', token, {
        httpOnly: true,
        secure: false, // Allow HTTP (e.g. Tailscale, local network) without dropping the cookie
        sameSite: 'lax',
        maxAge: ttlDays * 24 * 60 * 60 * 1000,
    });
}
/** Creates personal workspace for a new user */
async function createPersonalWorkspace(user) {
    const workspace = await WorkspaceRepository_1.WorkspaceRepository.create({
        name: `${user.name}'s Workspace`,
        description: 'Personal workspace',
        ownerId: user.id || user._id,
    });
    const { EnvironmentRepository } = await Promise.resolve().then(() => __importStar(require('../repositories/EnvironmentRepository')));
    await EnvironmentRepository.upsertGlobal(workspace.id || workspace._id, []);
}
/** Main auth middleware – validates JWT from cookie and optionally handles header auth */
async function authenticate(req, res, next) {
    try {
        const config = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
        const mode = config?.auth.mode ?? 'login';
        const ttlDays = config?.auth.jwtTtlDays ?? 7;
        const refreshHours = config?.auth.jwtRefreshHoursBeforeExpiry ?? 24;
        // ── Header-based auto-provisioning ──────────────────────────────────────
        if (mode === 'header' || mode === 'both') {
            const headerName = config?.auth.headerName ?? 'X-Auth-User';
            const headerValue = req.headers[headerName.toLowerCase()];
            if (headerValue) {
                let user = await User_1.User.findOne({ email: headerValue.toLowerCase() });
                if (!user) {
                    // Auto-provision
                    user = await User_1.User.create({
                        name: headerValue,
                        email: headerValue.toLowerCase(),
                        passwordHash: null,
                        authType: 'header',
                    });
                    await createPersonalWorkspace(user);
                }
                if (user.status !== 'active') {
                    return res.status(403).json({ message: 'Account suspended' });
                }
                await User_1.User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });
                const token = signToken(String(user._id), ttlDays);
                setCookieToken(res, token, ttlDays);
                req.user = user;
                return next();
            }
            if (mode === 'header') {
                return res.status(401).json({ message: 'Missing auth header' });
            }
        }
        // ── JWT Cookie validation ───────────────────────────────────────────────
        const token = req.cookies?.token;
        if (!token) {
            return res.status(401).json({ message: 'Not authenticated' });
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch {
            res.clearCookie('token');
            return res.status(401).json({ message: 'Session expired' });
        }
        const user = await User_1.User.findById(payload.sub);
        if (!user || user.status !== 'active') {
            res.clearCookie('token');
            return res.status(401).json({ message: 'User not found or suspended' });
        }
        // Auto-refresh: if token expires within refreshHours, issue new token
        const exp = payload.exp;
        const now = Math.floor(Date.now() / 1000);
        const refreshThreshold = refreshHours * 3600;
        if (exp - now < refreshThreshold) {
            const newToken = signToken(String(user._id), ttlDays);
            setCookieToken(res, newToken, ttlDays);
        }
        req.user = user;
        next();
    }
    catch (err) {
        next(err);
    }
}
/** Require SuperAdmin */
function requireSuperAdmin(req, res, next) {
    if (!req.user?.isSuperAdmin) {
        return res.status(403).json({ message: 'Super admin access required' });
    }
    next();
}
//# sourceMappingURL=auth.js.map
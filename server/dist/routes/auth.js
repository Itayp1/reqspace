"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const UserRepository_1 = require("../repositories/UserRepository");
const SystemConfigRepository_1 = require("../repositories/SystemConfigRepository");
const auth_1 = require("../middleware/auth");
const AuditLogRepository_1 = require("../repositories/AuditLogRepository");
const router = (0, express_1.Router)();
// ── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    const config = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
    if (!config?.auth.allowSelfRegistration) {
        return res.status(403).json({ message: 'Self-registration is disabled' });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'name, email and password are required' });
    }
    // Domain whitelist check
    const domains = config.auth.allowedEmailDomains;
    if (domains.length > 0) {
        const domain = email.split('@')[1]?.toLowerCase();
        if (!domain || !domains.includes('@' + domain)) {
            return res.status(403).json({ message: 'Email domain not allowed' });
        }
    }
    const existing = await UserRepository_1.UserRepository.findByEmail(email);
    if (existing) {
        return res.status(409).json({ message: 'Email already registered' });
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    const user = await UserRepository_1.UserRepository.create({
        name,
        email: email.toLowerCase(),
        passwordHash,
        authType: 'password',
    });
    // Auto-create personal workspace
    await (0, auth_1.createPersonalWorkspace)(user);
    await (0, AuditLogRepository_1.logAudit)(user._id, 'user.register', {
        ip: req.ip,
        details: { email },
    });
    const token = (0, auth_1.signToken)(String(user._id), config.auth.jwtTtlDays);
    (0, auth_1.setCookieToken)(res, token, config.auth.jwtTtlDays);
    return res.status(201).json({
        message: 'Registered successfully',
        user: { id: user._id, token: token, name: user.name, email: user.email },
    });
});
// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const config = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
    const mode = config?.auth.mode ?? 'login';
    if (mode === 'header') {
        return res.status(403).json({ message: 'Login form disabled. Use header authentication.' });
    }
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'email and password are required' });
    }
    const user = await UserRepository_1.UserRepository.findByEmail(email);
    if (!user || !user.passwordHash) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.status !== 'active') {
        return res.status(403).json({ message: 'Account suspended' });
    }
    const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!valid) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    await UserRepository_1.UserRepository.update(user._id, { lastLoginAt: new Date() });
    await (0, AuditLogRepository_1.logAudit)(user._id, 'auth.login', { ip: req.ip });
    const ttlDays = config?.auth.jwtTtlDays ?? 7;
    const token = (0, auth_1.signToken)(String(user._id), ttlDays);
    (0, auth_1.setCookieToken)(res, token, ttlDays);
    return res.json({
        user: {
            id: user._id, token: token,
            name: user.name,
            email: user.email,
            isSuperAdmin: user.isSuperAdmin,
            mustChangePassword: user.mustChangePassword,
            avatar: user.avatar,
        },
    });
});
// ── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    return res.json({ message: 'Logged out' });
});
// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', auth_1.authenticate, (req, res) => {
    const user = req.user;
    return res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
        avatar: user.avatar,
        preferences: user.preferences,
        authType: user.authType,
    });
});
// ── GET /api/auth/config ─────────────────────────────────────────────────────
// Public endpoint – client needs to know what auth mode to show
router.get('/config', async (_req, res) => {
    const config = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
    return res.json({
        mode: config?.auth.mode ?? 'login',
        allowSelfRegistration: config?.auth.allowSelfRegistration ?? true,
        googleOAuth: {
            enabled: config?.auth.googleOAuth?.enabled ?? false,
            clientId: config?.auth.googleOAuth?.clientId ?? '',
        }
    });
});
// ── POST /api/auth/change-password ──────────────────────────────────────────
router.post('/change-password', auth_1.authenticate, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 5) {
        return res.status(400).json({ message: 'Password must be at least 5 characters' });
    }
    const user = req.user;
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    await UserRepository_1.UserRepository.update(user._id, { passwordHash, mustChangePassword: false });
    await (0, AuditLogRepository_1.logAudit)(user._id, 'auth.change_password', { details: { forced: true } });
    return res.json({ message: 'Password changed successfully' });
});
// ── POST /api/auth/google ───────────────────────────────────────────────────
router.post('/google', async (req, res) => {
    const { code, redirectUri } = req.body;
    if (!code)
        return res.status(400).json({ message: 'Code is required' });
    const config = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
    const oauthConfig = config?.auth.googleOAuth;
    if (!oauthConfig?.enabled)
        return res.status(403).json({ message: 'Google OAuth is disabled' });
    try {
        // 1. Exchange code for token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: oauthConfig.clientId,
                client_secret: oauthConfig.clientSecret,
                redirect_uri: redirectUri || 'http://localhost:5173/auth/google/callback',
                grant_type: 'authorization_code',
            }),
        });
        const tokenData = await tokenResponse.json();
        if (tokenData.error)
            return res.status(400).json({ message: 'Failed to exchange token', details: tokenData });
        // 2. Fetch user info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();
        if (!userData.email)
            return res.status(400).json({ message: 'No email found from Google' });
        // 3. Find or create user
        let user = await UserRepository_1.UserRepository.findByEmail(userData.email);
        if (!user) {
            if (!config?.auth.allowSelfRegistration) {
                return res.status(403).json({ message: 'Self registration is disabled' });
            }
            user = await UserRepository_1.UserRepository.create({
                name: userData.name || userData.email.split('@')[0],
                email: userData.email,
                passwordHash: '',
                authType: 'sso',
                avatar: userData.picture,
                status: 'active',
            });
            await (0, auth_1.createPersonalWorkspace)(user);
            await (0, AuditLogRepository_1.logAudit)(user._id, 'auth.register', { ip: req.ip, details: { method: 'google' } });
        }
        if (user.status !== 'active') {
            return res.status(403).json({ message: 'Account suspended' });
        }
        await UserRepository_1.UserRepository.update(user._id, { lastLoginAt: new Date() });
        await (0, AuditLogRepository_1.logAudit)(user._id, 'auth.login', { ip: req.ip, details: { method: 'google' } });
        const ttlDays = config?.auth.jwtTtlDays ?? 7;
        const token = (0, auth_1.signToken)(String(user._id), ttlDays);
        (0, auth_1.setCookieToken)(res, token, ttlDays);
        return res.json({
            user: {
                id: user._id,
                token: token,
                name: user.name,
                email: user.email,
                isSuperAdmin: user.isSuperAdmin,
                mustChangePassword: user.mustChangePassword,
                avatar: user.avatar,
            },
        });
    }
    catch (error) {
        console.error('Google OAuth Error:', error);
        return res.status(500).json({ message: 'Internal server error during Google login' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map
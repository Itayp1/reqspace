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
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
exports.ensureDefaultAdmin = ensureDefaultAdmin;
const mongoose_1 = __importStar(require("mongoose"));
const ClientCertificateSchema = new mongoose_1.Schema({
    hostname: { type: String, required: true },
    cert: { type: String, required: true },
    key: { type: String, required: true },
    passphrase: { type: String },
    createdAt: { type: Date, default: Date.now },
});
const UserSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    authType: { type: String, enum: ['password', 'header'], required: true },
    isSuperAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
    avatar: { type: String },
    settings: {
        followRedirects: { type: Boolean, default: true },
        verifySsl: { type: Boolean, default: true },
        sendNoCacheHeader: { type: Boolean, default: false },
        encodeUrl: { type: Boolean, default: true },
        timeout: { type: Number, default: 0 },
        proxyEnabled: { type: Boolean, default: false },
        proxyUrl: { type: String, default: 'http://127.0.0.1:8080' },
        proxyAuthEnabled: { type: Boolean, default: false },
        proxyUsername: { type: String, default: '' },
        proxyPassword: { type: String, default: '' },
        saveHistory: { type: Boolean, default: true },
        shortcuts: {
            search: { type: String, default: 'ctrl+k' },
            save: { type: String, default: 'ctrl+s' },
            send: { type: String, default: 'ctrl+enter' },
        }
    },
    clientCertificates: { type: [ClientCertificateSchema], default: [] },
    historyUsedBytes: { type: Number, default: 0 },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
}, { timestamps: true });
UserSchema.index({ email: 1 });
UserSchema.index({ isSuperAdmin: 1 });
exports.User = mongoose_1.default.model('User', UserSchema);
async function ensureDefaultAdmin() {
    const adminCount = await exports.User.countDocuments({ isSuperAdmin: true });
    if (adminCount === 0) {
        const bcrypt = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const passwordHash = await bcrypt.hash('admin', 10);
        const adminUser = await exports.User.create({
            name: 'Admin',
            email: 'admin', // The user requested 'admin' as username, but our schema uses 'email' field and validates lowercase etc. Let's just use 'admin'. Wait, we will need to bypass email validation if it expects '@' ? It just says lowercase and trim. We'll use 'admin'
            passwordHash,
            authType: 'password',
            isSuperAdmin: true,
            mustChangePassword: true
        });
        // Create a personal workspace for the admin
        const { Workspace } = await Promise.resolve().then(() => __importStar(require('./Workspace')));
        await Workspace.create({
            name: `Admin's Workspace`,
            description: 'Personal workspace',
            ownerId: adminUser._id,
            members: [{ userId: adminUser._id, role: 'owner', joinedAt: new Date() }],
        });
        console.log('✅ Default superadmin created (admin / admin) - password change required');
    }
}
//# sourceMappingURL=User.js.map
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
exports.SystemConfig = void 0;
exports.ensureSystemConfig = ensureSystemConfig;
const mongoose_1 = __importStar(require("mongoose"));
const SystemConfigSchema = new mongoose_1.Schema({
    _id: { type: String, default: 'global' },
    auth: {
        mode: { type: String, enum: ['login', 'header', 'both'], default: 'login' },
        headerName: { type: String, default: 'X-Auth-User' },
        allowSelfRegistration: { type: Boolean, default: true },
        allowedEmailDomains: { type: [String], default: [] },
        jwtTtlDays: { type: Number, default: 7 },
        jwtRefreshHoursBeforeExpiry: { type: Number, default: 24 },
        googleOAuth: {
            enabled: { type: Boolean, default: false },
            clientId: { type: String, default: '' },
            clientSecret: { type: String, default: '' }
        },
        smtp: {
            enabled: { type: Boolean, default: false },
            host: { type: String, default: '' },
            port: { type: Number, default: 587 },
            user: { type: String, default: '' },
            pass: { type: String, default: '' },
            fromAddress: { type: String, default: 'noreply@reqspace.com' }
        }
    },
    history: {
        maxRequestBodyKB: { type: Number, default: 5120 }, // 5MB
        maxTotalPerUserMB: { type: Number, default: 100 },
        cleanupPolicy: { type: String, enum: ['fifo'], default: 'fifo' },
    },
    proxy: {
        enabled: { type: Boolean, default: false },
        url: { type: String, default: '' },
        username: { type: String, default: '' },
        password: { type: String, default: '' },
    },
});
exports.SystemConfig = mongoose_1.default.model('SystemConfig', SystemConfigSchema);
async function ensureSystemConfig() {
    const count = await exports.SystemConfig.countDocuments();
    if (count === 0) {
        await exports.SystemConfig.create({
            _id: 'global',
            auth: {
                mode: 'login',
                headerName: 'X-Auth-User',
                allowSelfRegistration: true,
                allowedEmailDomains: [],
                jwtTtlDays: 7,
                jwtRefreshHoursBeforeExpiry: 24,
            },
            history: {
                maxRequestBodyKB: 5120,
                maxTotalPerUserMB: 100,
                cleanupPolicy: 'fifo',
            },
            proxy: {
                enabled: false,
                url: '',
                username: '',
                password: '',
            }
        });
    }
}
//# sourceMappingURL=SystemConfig.js.map
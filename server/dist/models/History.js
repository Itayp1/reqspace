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
exports.History = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const HistorySchema = new mongoose_1.Schema({
    workspaceId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    requestSnapshot: {
        method: String,
        url: String,
        headers: { type: Map, of: String },
        body: String,
        params: [{ key: String, value: String }],
        auth: { type: mongoose_1.Schema.Types.Mixed },
    },
    responseSnapshot: {
        status: Number,
        statusText: String,
        headers: { type: Map, of: String },
        body: { type: String, default: '' },
        bodyTruncated: { type: Boolean, default: false },
        responseTime: Number,
        size: Number,
    },
    testResults: [
        {
            name: String,
            passed: Boolean,
            error: String,
            _id: false,
        },
    ],
    executedAt: { type: Date, default: Date.now },
}, { timestamps: false });
HistorySchema.index({ userId: 1, executedAt: -1 });
HistorySchema.index({ workspaceId: 1 });
exports.History = mongoose_1.default.model('History', HistorySchema);
//# sourceMappingURL=History.js.map
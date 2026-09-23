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
exports.Request = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const CommentSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });
const KeyValueSchema = new mongoose_1.Schema({
    key: { type: String, default: '' },
    value: { type: String, default: '' },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    type: { type: String },
    fileName: { type: String },
    fileData: { type: String },
}, { _id: false });
const RequestSchema = new mongoose_1.Schema({
    collectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Collection', required: true },
    folderId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Folder', default: null },
    name: { type: String, required: true, trim: true },
    method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        default: 'GET',
    },
    url: { type: String, default: '' },
    params: { type: [KeyValueSchema], default: [] },
    headers: { type: [KeyValueSchema], default: [] },
    auth: {
        type: {
            type: String,
            enum: ['none', 'bearer', 'basic', 'apikey', 'oauth2'],
            default: 'none',
        },
        bearer: { token: String },
        basic: { username: String, password: String },
        apikey: { key: String, value: String, in: String },
        oauth2: { accessToken: String, tokenType: String },
    },
    body: {
        mode: {
            type: String,
            enum: ['none', 'raw', 'form-data', 'urlencoded', 'binary'],
            default: 'none',
        },
        raw: { type: String, default: '' },
        rawLanguage: {
            type: String,
            enum: ['json', 'text', 'xml', 'html', 'javascript'],
            default: 'json',
        },
        formData: { type: [KeyValueSchema], default: [] },
        urlencoded: { type: [KeyValueSchema], default: [] },
    },
    preRequestScript: { type: String, default: '' },
    testScript: { type: String, default: '' },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    comments: { type: [CommentSchema], default: [] },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
RequestSchema.index({ collectionId: 1 });
RequestSchema.index({ folderId: 1 });
exports.Request = mongoose_1.default.model('Request', RequestSchema);
//# sourceMappingURL=Request.js.map
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
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const history_1 = require("./history");
const mongoose_1 = __importDefault(require("mongoose"));
const SystemConfig_1 = require("../models/SystemConfig");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
// ── POST /api/proxy ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { method, url, headers = {}, body, workspaceId, followRedirects = true, timeout = 30000, verifySsl = true, localProxy } = req.body;
    if (!url)
        return res.status(400).json({ message: 'url is required' });
    if (!ALLOWED_METHODS.includes(method?.toUpperCase())) {
        return res.status(400).json({ message: 'Invalid HTTP method' });
    }
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        let timeoutId;
        if (timeout > 0) {
            timeoutId = setTimeout(() => controller.abort(), timeout);
        }
        const fetchOptions = {
            method: method.toUpperCase(),
            headers: new Headers(headers),
            signal: controller.signal,
            redirect: followRedirects ? 'follow' : 'manual',
        };
        let activeProxy = null;
        if (localProxy?.url) {
            activeProxy = localProxy;
        }
        else {
            const config = await SystemConfig_1.SystemConfig.findById('global');
            if (config?.proxy?.enabled && config.proxy.url) {
                activeProxy = config.proxy;
            }
        }
        // Find matching client certificate
        const targetUrlObj = new URL(url);
        const userCerts = req.user?.clientCertificates || [];
        let matchedCert = null;
        for (const c of userCerts) {
            if (c.hostname === targetUrlObj.hostname) {
                matchedCert = c;
                break;
            }
            if (c.hostname.startsWith('*.')) {
                const domain = c.hostname.substring(2);
                if (targetUrlObj.hostname === domain || targetUrlObj.hostname.endsWith('.' + domain)) {
                    matchedCert = c;
                    break;
                }
            }
        }
        const connectOpts = { rejectUnauthorized: verifySsl !== false };
        if (matchedCert) {
            connectOpts.cert = matchedCert.cert;
            connectOpts.key = matchedCert.key;
            if (matchedCert.passphrase)
                connectOpts.passphrase = matchedCert.passphrase;
        }
        const { ProxyAgent, Agent, fetch: undiciFetch } = await Promise.resolve().then(() => __importStar(require('undici')));
        if (activeProxy?.url) {
            let proxyUrlStr = activeProxy.url;
            if (!proxyUrlStr.startsWith('http'))
                proxyUrlStr = 'http://' + proxyUrlStr;
            const proxyUrl = new URL(proxyUrlStr);
            if (activeProxy.username) {
                proxyUrl.username = activeProxy.username;
                proxyUrl.password = activeProxy.password || '';
            }
            fetchOptions.dispatcher = new ProxyAgent({
                uri: proxyUrl.toString(),
                connect: connectOpts
            });
        }
        else {
            fetchOptions.dispatcher = new Agent({ connect: connectOpts });
        }
        if (!['GET', 'HEAD'].includes(method.toUpperCase()) && body !== undefined) {
            if (body._isFormData) {
                const formData = new FormData();
                for (const item of body.items) {
                    if (item.type === 'file') {
                        const buffer = Buffer.from(item.content, 'base64');
                        const blob = new Blob([buffer]);
                        formData.append(item.key, blob, item.filename);
                    }
                    else {
                        formData.append(item.key, item.value);
                    }
                }
                fetchOptions.body = formData;
            }
            else {
                fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            }
        }
        const response = await undiciFetch(url, fetchOptions);
        if (timeoutId)
            clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const responseHeaders = {};
        response.headers.forEach((value, key) => { responseHeaders[key] = value; });
        const contentType = (responseHeaders['content-type'] || '').toLowerCase();
        const isBinary = contentType.includes('image/') || contentType.includes('application/pdf') || contentType.includes('audio/') || contentType.includes('video/') || contentType.includes('application/octet-stream');
        const responseBody = isBinary ? buffer.toString('base64') : buffer.toString('utf8');
        const isBase64 = isBinary;
        // Save to history if workspaceId provided (Fire and forget to avoid delay)
        const shouldSaveHistory = req.body.saveHistory !== false;
        // Calculate total size of request + response roughly
        let reqSize = 0;
        if (body) {
            if (typeof body === 'string')
                reqSize = body.length;
            else if (body._isFormData)
                reqSize = JSON.stringify(body).length;
            else
                reqSize = JSON.stringify(body).length;
        }
        const resSize = buffer.length;
        const totalSize = reqSize + resSize;
        const isUnderLimit = totalSize <= 500 * 1024; // 500 KB limit
        if (workspaceId && req.user && shouldSaveHistory && isUnderLimit) {
            (0, history_1.saveHistoryEntry)(req.user._id, new mongoose_1.default.Types.ObjectId(workspaceId), {
                requestSnapshot: { method, url, headers, body },
                responseBody: isBase64 ? `[Binary Data: ${contentType}]` : responseBody,
                responseStatus: response.status,
                responseStatusText: response.statusText,
                responseHeaders,
                responseTime,
                responseSize: buffer.length,
                testResults: [],
            }).catch(console.error);
        }
        return res.json({
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            isBase64,
            responseTime,
            size: buffer.length,
        });
    }
    catch (err) {
        const elapsed = Date.now() - startTime;
        if (err instanceof Error && err.name === 'AbortError') {
            return res.status(408).json({ message: 'Request timed out', responseTime: elapsed });
        }
        return res.status(502).json({
            message: 'Proxy error',
            error: err instanceof Error ? err.message : String(err),
            responseTime: elapsed,
        });
    }
});
exports.default = router;
//# sourceMappingURL=proxy.js.map
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
const express_1 = require("express");
const SharedLink_1 = require("../models/SharedLink");
const SystemConfig_1 = require("../models/SystemConfig");
const router = (0, express_1.Router)();
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
router.post('/:shortId/proxy', async (req, res) => {
    const link = await SharedLink_1.SharedLink.findOne({ shortId: req.params.shortId });
    if (!link || link.expiresAt < new Date()) {
        return res.status(404).json({ message: 'Link not found or expired' });
    }
    const { method, url, headers = {}, body, followRedirects = true, timeout = 30000, verifySsl = true, localProxy } = req.body;
    if (!url)
        return res.status(400).json({ message: 'url is required' });
    if (!ALLOWED_METHODS.includes(method?.toUpperCase())) {
        return res.status(400).json({ message: 'Invalid HTTP method' });
    }
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
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
        if (activeProxy?.url) {
            let proxyUrlStr = activeProxy.url;
            if (!proxyUrlStr.startsWith('http'))
                proxyUrlStr = 'http://' + proxyUrlStr;
            const proxyUrl = new URL(proxyUrlStr);
            if (activeProxy.username) {
                proxyUrl.username = activeProxy.username;
                proxyUrl.password = activeProxy.password || '';
            }
            const { ProxyAgent } = await Promise.resolve().then(() => __importStar(require('undici')));
            fetchOptions.dispatcher = new ProxyAgent(proxyUrl.toString());
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
        const { fetch: undiciFetch, Agent } = await Promise.resolve().then(() => __importStar(require('undici')));
        if (!verifySsl && !fetchOptions.dispatcher) {
            fetchOptions.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
        }
        const response = await undiciFetch(url, fetchOptions);
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
//# sourceMappingURL=shareProxy.js.map
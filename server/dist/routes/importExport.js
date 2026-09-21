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
const Collection_1 = require("../models/Collection");
const Folder_1 = require("../models/Folder");
const Request_1 = require("../models/Request");
const soap = __importStar(require("soap"));
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Import/Export Routes placeholder
router.get('/collections/:id/export', async (req, res) => {
    const collection = await Collection_1.Collection.findById(req.params.id);
    res.json({ info: { name: collection?.name }, item: [] }); // Dummy export
});
router.post('/collections/import', async (req, res) => {
    res.json({ message: 'Import successful (stub)' });
});
router.post('/requests/import/curl', async (req, res) => {
    const { curl, workspaceId } = req.body;
    if (!curl)
        return res.status(400).json({ message: 'curl string required' });
    let method = 'GET';
    const methodMatch = curl.match(/-X\s+([A-Z]+)/);
    if (methodMatch)
        method = methodMatch[1];
    else if (curl.includes('-d ') || curl.includes('--data '))
        method = 'POST';
    let url = '';
    const tokens = curl.split(/\s+/);
    for (const token of tokens) {
        const clean = token.replace(/^['"]|['"]$/g, '');
        if (clean.startsWith('http://') || clean.startsWith('https://')) {
            url = clean;
            break;
        }
    }
    const headers = [];
    const headerRegex = /-H\s+(['"])(.*?)\1/g;
    let match;
    while ((match = headerRegex.exec(curl)) !== null) {
        const headerStr = match[2];
        const splitIdx = headerStr.indexOf(':');
        if (splitIdx > 0) {
            headers.push({
                key: headerStr.substring(0, splitIdx).trim(),
                value: headerStr.substring(splitIdx + 1).trim(),
                enabled: true
            });
        }
    }
    let body = '';
    const bodyRegex = /(?:-d|--data(?:-raw)?)\s+(['"])(.*?)\1/g;
    const bodyMatch = bodyRegex.exec(curl);
    if (bodyMatch) {
        body = bodyMatch[2];
    }
    return res.json({
        name: 'Imported cURL',
        method,
        url,
        headers,
        body: { mode: body ? 'raw' : 'none', raw: body },
    });
});
router.post('/requests/import/raw-http', async (req, res) => {
    const { raw, workspaceId } = req.body;
    if (!raw)
        return res.status(400).json({ message: 'raw HTTP string required' });
    const lines = raw.split(/\r?\n/);
    if (lines.length === 0)
        return res.status(400).json({ message: 'Empty input' });
    const firstLine = lines[0].split(' ');
    const method = firstLine[0] || 'GET';
    let url = firstLine[1] || '';
    const headers = [];
    let i = 1;
    let host = '';
    for (; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
            i++;
            break;
        }
        const splitIdx = line.indexOf(':');
        if (splitIdx > 0) {
            const key = line.substring(0, splitIdx).trim();
            const value = line.substring(splitIdx + 1).trim();
            if (key.toLowerCase() === 'host')
                host = value;
            headers.push({ key, value, enabled: true });
        }
    }
    const body = lines.slice(i).join('\n');
    if (url.startsWith('/')) {
        if (host) {
            url = `http://${host}${url}`;
        }
        else {
            url = `http://localhost${url}`;
        }
    }
    return res.json({
        name: 'Imported Raw HTTP',
        method,
        url,
        headers,
        body: { mode: body.trim() ? 'raw' : 'none', raw: body },
    });
});
// ──────── POST /api/import/wsdl ────────────────────────────────────────────────────
router.post('/import/wsdl', async (req, res) => {
    const { url, workspaceId } = req.body;
    if (!url || !workspaceId) {
        return res.status(400).json({ message: 'url and workspaceId are required' });
    }
    try {
        const client = await soap.createClientAsync(url);
        const description = client.describe();
        // Create Collection
        const collection = await Collection_1.Collection.create({
            name: `WSDL: ${url.split('/').pop() || 'Service'}`,
            workspaceId,
            ownerId: req.user._id,
            createdBy: req.user._id
        });
        const services = client.wsdl.services;
        for (const [serviceName, service] of Object.entries(description)) {
            // Create Folder for Service
            const serviceFolder = await Folder_1.Folder.create({
                name: serviceName,
                collectionId: collection._id
            });
            for (const [portName, port] of Object.entries(service)) {
                // Create Folder for Port
                const portFolder = await Folder_1.Folder.create({
                    name: portName,
                    collectionId: collection._id,
                    parentFolderId: serviceFolder._id
                });
                const location = services?.[serviceName]?.ports?.[portName]?.location || url;
                for (const [operationName, operation] of Object.entries(port)) {
                    const methods = client.wsdl.services?.[serviceName]?.ports?.[portName]?.binding?.methods || {};
                    const soapAction = methods[operationName]?.soapAction || '';
                    // Generate dummy XML body
                    let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n  <soapenv:Header/>\n  <soapenv:Body>\n    <${operationName}>\n`;
                    if (operation.input) {
                        for (const [paramName, paramType] of Object.entries(operation.input)) {
                            xmlBody += `      <${paramName}>?<!-- ${paramType} --></${paramName}>\n`;
                        }
                    }
                    xmlBody += `    </${operationName}>\n  </soapenv:Body>\n</soapenv:Envelope>`;
                    await Request_1.Request.create({
                        name: operationName,
                        collectionId: collection._id,
                        folderId: portFolder._id,
                        method: 'POST',
                        url: location,
                        headers: [
                            { key: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true, _id: new mongoose_1.default.Types.ObjectId().toString() },
                            ...(soapAction ? [{ key: 'SOAPAction', value: `"${soapAction}"`, enabled: true, _id: new mongoose_1.default.Types.ObjectId().toString() }] : [])
                        ],
                        body: { mode: 'raw', raw: xmlBody, rawLanguage: 'xml' },
                        createdBy: req.user._id
                    });
                }
            }
        }
        res.json({ message: 'WSDL Imported Successfully', collectionId: collection._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to parse WSDL: ' + error.message });
    }
});
exports.default = router;
//# sourceMappingURL=importExport.js.map
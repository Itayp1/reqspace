// The Electron main-process side of the client transport (TODO.md SEC-0.2 /
// SEC-0.7). This is the only place in the desktop build that sends a user's
// request over the network — the renderer never has raw network access
// (contextIsolation + nodeIntegration:false), and the Reqspace server never
// sees the traffic (SEC-0).
'use strict';

const { Agent, fetch: undiciFetch } = require('undici');

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BINARY_CONTENT_TYPE_PREFIXES = ['image/', 'application/pdf', 'audio/', 'video/', 'application/octet-stream'];

function isBinaryContentType(contentType) {
  const ct = (contentType || '').toLowerCase();
  return BINARY_CONTENT_TYPE_PREFIXES.some((p) => ct.includes(p));
}

function buildBody(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body._isFormData) {
    const formData = new FormData();
    for (const item of body.items || []) {
      if (item.type === 'file') {
        const buffer = Buffer.from(item.content, 'base64');
        formData.append(item.key, new Blob([buffer]), item.filename);
      } else {
        formData.append(item.key, item.value);
      }
    }
    return formData;
  }
  return undefined;
}

async function readCapped(body, maxBytes) {
  if (!body) return { bytes: Buffer.alloc(0), truncated: false };
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (maxBytes > 0 && total + value.length > maxBytes) {
      chunks.push(Buffer.from(value.subarray(0, Math.max(0, maxBytes - total))));
      total = maxBytes;
      truncated = true;
      try { await reader.cancel(); } catch { /* stream already closing */ }
      break;
    }
    chunks.push(Buffer.from(value));
    total += value.length;
  }
  return { bytes: Buffer.concat(chunks, total), truncated };
}

function classifyError(err) {
  const cause = err && err.cause ? err.cause : err;
  const code = cause && cause.code;
  if (err && err.name === 'AbortError') return { code: 'TIMEOUT', message: 'Request timed out.' };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { code: 'DNS', message: `Could not resolve host: ${cause.hostname || ''}`.trim() };
  if (code === 'ECONNREFUSED') return { code: 'REFUSED', message: 'Connection refused.' };
  return { code: 'UNKNOWN', message: (err && err.message) || 'Request failed.' };
}

async function handleSend(_evt, req) {
  const started = Date.now();
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.includes(method)) {
      return { ok: false, error: { code: 'BAD_URL', message: `Invalid HTTP method: ${req.method}` } };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(req.url);
    } catch {
      return { ok: false, error: { code: 'BAD_URL', message: 'Invalid URL.' } };
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { ok: false, error: { code: 'BAD_URL', message: 'Only http and https URLs are allowed.' } };
    }

    const timeout = req.timeout > 0 ? req.timeout : 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const connect = { rejectUnauthorized: req.verifySsl !== false };
    if (req.clientCert && req.clientCert.cert && req.clientCert.key) {
      connect.cert = req.clientCert.cert;
      connect.key = req.clientCert.key;
      if (req.clientCert.passphrase) connect.passphrase = req.clientCert.passphrase;
    }

    const fetchOptions = {
      method,
      headers: req.headers || {},
      signal: controller.signal,
      redirect: req.followRedirects === false ? 'manual' : 'follow',
      dispatcher: new Agent({ connect }),
    };
    if (!['GET', 'HEAD'].includes(method)) {
      const body = buildBody(req.body);
      if (body !== undefined) fetchOptions.body = body;
    }

    let response;
    try {
      response = await undiciFetch(req.url, fetchOptions);
    } finally {
      clearTimeout(timer);
    }

    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });

    const maxBytes = req.maxResponseBytes > 0 ? req.maxResponseBytes : 50 * 1024 * 1024;
    const { bytes, truncated } = await readCapped(response.body, maxBytes);
    const isBase64 = isBinaryContentType(headers['content-type']);

    return {
      ok: true,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: isBase64 ? bytes.toString('base64') : bytes.toString('utf8'),
        isBase64,
        responseTime: Date.now() - started,
        size: bytes.length,
        truncated,
      },
    };
  } catch (err) {
    return { ok: false, error: classifyError(err) };
  }
}

function registerSendHandler(ipcMain) {
  ipcMain.handle('reqspace:send', handleSend);
}

module.exports = { registerSendHandler, handleSend };

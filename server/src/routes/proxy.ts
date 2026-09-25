import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { saveHistoryEntry } from './history';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { createSafeLookup } from '../utils/ssrf';

const router = Router();
router.use(authenticate);

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// ── POST /api/proxy ─────────────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  const { method, url, headers = {}, body, workspaceId, followRedirects = true, timeout = 30000, verifySsl = true, localProxy } = req.body;

  if (!url) return res.status(400).json({ message: 'url is required' });
  if (!ALLOWED_METHODS.includes(method?.toUpperCase())) {
    return res.status(400).json({ message: 'Invalid HTTP method' });
  }

  // Only http/https may be proxied — block file:, gopher:, data:, etc. (CR#25).
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ message: 'Invalid URL' });
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ message: 'Only http and https URLs are allowed' });
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    const fetchOptions: any = {
      method: method.toUpperCase(),
      headers: new Headers(headers as any),
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
    };

    const systemConfig = await SystemConfigRepository.getConfig();
    const allowPrivateTargets = systemConfig?.proxy?.allowPrivateTargets ?? false;

    let activeProxy = null;
    if (localProxy?.url) {
      activeProxy = localProxy;
    } else if (systemConfig?.proxy?.enabled && systemConfig.proxy.url) {
      activeProxy = systemConfig.proxy;
    }

    // Find matching client certificate
    const targetUrlObj = new URL(url);
    const userCerts = req.user?.clientCertificates || [];
    let matchedCert: any = null;
    
    for (const c of userCerts) {
      if (c.hostname === targetUrlObj.hostname) {
        matchedCert = c; break;
      }
      if (c.hostname.startsWith('*.')) {
        const domain = c.hostname.substring(2);
        if (targetUrlObj.hostname === domain || targetUrlObj.hostname.endsWith('.' + domain)) {
          matchedCert = c; break;
        }
      }
    }

    const connectOpts: any = { rejectUnauthorized: verifySsl !== false, lookup: createSafeLookup(allowPrivateTargets) };
    if (matchedCert) {
      connectOpts.cert = matchedCert.cert;
      connectOpts.key = matchedCert.key;
      if (matchedCert.passphrase) connectOpts.passphrase = matchedCert.passphrase;
    }

    const { ProxyAgent, Agent, fetch: undiciFetch } = await import('undici');

    if (activeProxy?.url) {
      let proxyUrlStr = activeProxy.url;
      if (!proxyUrlStr.startsWith('http')) proxyUrlStr = 'http://' + proxyUrlStr;
      
      const proxyUrl = new URL(proxyUrlStr);
      if (activeProxy.username) {
        proxyUrl.username = activeProxy.username;
        proxyUrl.password = activeProxy.password || '';
      }
      fetchOptions.dispatcher = new ProxyAgent({
        uri: proxyUrl.toString(),
        connect: connectOpts
      });
    } else {
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
          } else {
            formData.append(item.key, item.value);
          }
        }
        fetchOptions.body = formData;
      } else {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
    }

    
    const response = await undiciFetch(url, fetchOptions);
    if (timeoutId) clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const responseHeaders: Record<string, string> = {};
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
      if (typeof body === 'string') reqSize = body.length;
      else if (body._isFormData) reqSize = JSON.stringify(body).length;
      else reqSize = JSON.stringify(body).length;
    }
    const resSize = buffer.length;
    const totalSize = reqSize + resSize;
    const isUnderLimit = totalSize <= 500 * 1024; // 500 KB limit

    if (workspaceId && req.user && shouldSaveHistory && isUnderLimit) {
      saveHistoryEntry(
        req.user._id as string || req.user.id,
        workspaceId,
        {
          requestSnapshot: { method, url, headers, body },
          responseBody: isBase64 ? `[Binary Data: ${contentType}]` : responseBody,
          responseStatus: response.status,
          responseStatusText: response.statusText,
          responseHeaders,
          responseTime,
          responseSize: buffer.length,
          testResults: [],
        }
      ).catch(console.error);
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
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(408).json({ message: 'Request timed out', responseTime: elapsed });
    }
    // undici wraps connect-time errors (incl. our SSRF-guard lookup) in a
    // TypeError with the original error as `.cause`.
    const cause = err instanceof Error ? (err as any).cause : undefined;
    if ((err instanceof Error && err.name === 'SsrfBlockedError') || cause?.name === 'SsrfBlockedError') {
      return res.status(400).json({ message: (cause ?? err as Error).message, responseTime: elapsed });
    }
    return res.status(502).json({
      message: 'Proxy error',
      error: err instanceof Error ? err.message : String(err),
      responseTime: elapsed,
    });
  }
});

export default router;

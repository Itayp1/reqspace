import { Router, Request, Response } from 'express';
import { SharedLinkRepository } from '../repositories/SharedLinkRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { rateLimit } from '../middleware/rateLimit';
import { createSafeLookup } from '../utils/ssrf';

const router = Router();
const publicProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests for this shared link — please try again later.',
});

function urlIsInCollection(requested: string, storedUrls: string[]): boolean {
  let requestedUrl: URL;
  try { requestedUrl = new URL(requested); } catch { return false; }
  return storedUrls.some(stored => {
    if (!stored) return false;
    if (stored === requested) return true;
    try {
      const template = stored.replace(/\{\{[^}]+\}\}/g, 'placeholder');
      const storedUrl = new URL(template);
      return storedUrl.origin === requestedUrl.origin && storedUrl.pathname === requestedUrl.pathname;
    } catch {
      return false;
    }
  });
}
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

router.post('/:shortId/proxy', publicProxyLimiter, async (req: Request, res: Response) => {
  const link = await SharedLinkRepository.findByShortId(req.params.shortId as string);
  if (!link || link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }

  const { method, url, headers = {}, body, followRedirects = true, timeout = 30000, verifySsl = true, localProxy } = req.body;
  if (!url) return res.status(400).json({ message: 'url is required' });
  if (localProxy) {
    return res.status(400).json({ message: 'A caller-supplied proxy is not available on a shared link' });
  }
  const sharedRequests = await RequestRepository.findByCollection(link.collectionId);
  if (!urlIsInCollection(String(url), sharedRequests.map(r => r.url))) {
    return res.status(403).json({ message: 'This shared link can only call URLs that belong to the collection' });
  }

  if (!ALLOWED_METHODS.includes(method?.toUpperCase())) {
    return res.status(400).json({ message: 'Invalid HTTP method' });
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

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

    if (activeProxy?.url) {
      let proxyUrlStr = activeProxy.url;
      if (!proxyUrlStr.startsWith('http')) proxyUrlStr = 'http://' + proxyUrlStr;
      
      const proxyUrl = new URL(proxyUrlStr);
      if (activeProxy.username) {
        proxyUrl.username = activeProxy.username;
        proxyUrl.password = activeProxy.password || '';
      }
      const { ProxyAgent } = await import('undici');
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
          } else {
            formData.append(item.key, item.value);
          }
        }
        fetchOptions.body = formData;
      } else {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
    }

    const { fetch: undiciFetch, Agent } = await import('undici');

    // Only the direct-connect path (no upstream proxy configured) needs the
    // SSRF-guarded lookup — a request that goes through an admin-configured
    // upstream proxy is resolved on that proxy's own network, not ours.
    if (!fetchOptions.dispatcher) {
      fetchOptions.dispatcher = new Agent({
        connect: { rejectUnauthorized: verifySsl !== false, lookup: createSafeLookup(allowPrivateTargets) },
      });
    }

    const response = await undiciFetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const responseHeaders: Record<string, string> = {};
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
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(408).json({ message: 'Request timed out', responseTime: elapsed });
    }
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

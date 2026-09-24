import { Router, Request, Response } from 'express';
import { SharedLinkRepository } from '../repositories/SharedLinkRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { createSafeLookup } from '../utils/ssrf';
import { rateLimit } from '../middleware/rateLimit';
import { clampTimeout, readCappedBody } from '../utils/proxyLimits';

const router = Router();
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const shareProxyLimiter = rateLimit({ windowMs: 60_000, max: 20, message: 'Too many shared proxy requests' });

function sameTarget(savedUrl: string, requested: string): boolean {
  try {
    const a = new URL(savedUrl);
    const b = new URL(requested);
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname;
  } catch {
    return savedUrl === requested;
  }
}

router.post('/:shortId/proxy', shareProxyLimiter, async (req: Request, res: Response) => {
  const link = await SharedLinkRepository.findByShortId(String(req.params.shortId));
  if (!link || link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }

  const { method, url, body, followRedirects = true, timeout, verifySsl = true, localProxy } = req.body;
  if (localProxy) return res.status(400).json({ message: 'localProxy is not allowed on a public share' });
  if (!url) return res.status(400).json({ message: 'url is required' });
  const verb = String(method || '').toUpperCase();
  if (!ALLOWED_METHODS.includes(verb)) return res.status(400).json({ message: 'Invalid HTTP method' });

  let parsed: URL;
  try { parsed = new URL(url); } catch { return res.status(400).json({ message: 'Invalid URL' }); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ message: 'Only http and https URLs are allowed' });
  }

  const saved = await RequestRepository.findByCollection(link.collectionId);
  const match = saved.find((r) => r.method.toUpperCase() === verb && sameTarget(r.url, url));
  if (!match) {
    return res.status(403).json({ message: 'URL is not part of the shared collection' });
  }

  const safeHeaders: Record<string, string> = {};
  for (const h of match.headers || []) {
    if (!h?.key || h.enabled === false) continue;
    const key = String(h.key).toLowerCase();
    if (key === 'authorization' || key === 'cookie' || key === 'proxy-authorization') continue;
    safeHeaders[h.key] = String(h.value ?? '');
  }

  const startTime = Date.now();
  const timeoutMs = clampTimeout(timeout);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const systemConfig = await SystemConfigRepository.getConfig();
    const allowPrivateTargets = false;
    void systemConfig;

    const { fetch: undiciFetch, Agent } = await import('undici');
    const fetchOptions: any = {
      method: verb,
      headers: safeHeaders,
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
      dispatcher: new Agent({
        connect: { rejectUnauthorized: verifySsl !== false, lookup: createSafeLookup(allowPrivateTargets) },
      }),
    };
    if (!['GET', 'HEAD'].includes(verb) && body !== undefined && typeof body === 'string') {
      fetchOptions.body = body;
    }

    const response = await undiciFetch(url, fetchOptions);
    clearTimeout(timeoutId);
    const buffer = await readCappedBody(response.body as any);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });
    const contentType = (responseHeaders['content-type'] || '').toLowerCase();
    const isBinary = /image\/|application\/pdf|audio\/|video\/|octet-stream/.test(contentType);
    return res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: isBinary ? buffer.toString('base64') : buffer.toString('utf8'),
      isBase64: isBinary,
      responseTime: Date.now() - startTime,
      size: buffer.length,
    });
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    const status = (err as any)?.status || ((err as Error)?.name === 'AbortError' ? 408 : 502);
    if ((err as Error)?.name === 'SsrfBlockedError' || (err as any)?.cause?.name === 'SsrfBlockedError') {
      return res.status(400).json({ message: 'Blocked by SSRF policy', responseTime: elapsed });
    }
    return res.status(status).json({ message: status === 413 ? 'Response too large' : 'Proxy error', responseTime: elapsed });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { SharedLink } from '../models/SharedLink';
import { SystemConfig } from '../models/SystemConfig';
import { createSafeLookup } from '../utils/ssrf';
import { rateLimit } from '../middleware/rateLimit';
import { RequestRepository } from '../repositories/RequestRepository';

async function readCapped(response: { body: ReadableStream<Uint8Array> | null }, maxBytes: number): Promise<Buffer> {
  const body = response.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      const err = new Error('Response exceeds the configured size limit') as Error & { status?: number };
      err.status = 413;
      throw err;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

const router = Router();
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const MAX_TIMEOUT_MS = Number(process.env.MAX_PROXY_TIMEOUT_MS || 120_000);
const MAX_RESPONSE_BYTES = Number(process.env.MAX_PROXY_RESPONSE_BYTES || 10 * 1024 * 1024);

const shareProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many shared proxy requests',
});

function sameRequestTarget(requested: string, saved: string): boolean {
  try {
    const a = new URL(requested);
    const b = new URL(saved);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

router.post('/:shortId/proxy', shareProxyLimiter, async (req: Request, res: Response) => {
  const link = await SharedLink.findOne({ shortId: req.params.shortId });
  if (!link || link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }

  const { method, url, headers = {}, body, followRedirects = true, timeout = 30000, verifySsl = true, localProxy } = req.body;

  if (!url) return res.status(400).json({ message: 'url is required' });
  if (!ALLOWED_METHODS.includes(method?.toUpperCase())) {
    return res.status(400).json({ message: 'Invalid HTTP method' });
  }

  // A public link must not be an open proxy, and must not accept a caller-supplied
  // upstream proxy (CR#3).
  if (localProxy) {
    return res.status(400).json({ message: 'localProxy is not allowed on a shared link' });
  }

  const saved = await RequestRepository.findByCollection(String(link.collectionId));
  const allowed = saved.some((r) => r.url && sameRequestTarget(String(url), r.url));
  if (!allowed) {
    return res.status(403).json({ message: 'URL is not part of the shared collection' });
  }

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
    const requestedTimeout = Number(timeout);
    const timeoutMs = Math.min(
      Math.max(Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : 30_000, 1),
      MAX_TIMEOUT_MS,
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions: any = {
      method: method.toUpperCase(),
      headers: new Headers(headers as any),
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
    };

    const systemConfig = await SystemConfig.findById('global');
    const allowPrivateTargets = systemConfig?.proxy?.allowPrivateTargets ?? false;

    let activeProxy = null;
    if (systemConfig?.proxy?.enabled && systemConfig.proxy.url) {
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
    const buffer = await readCapped(response, MAX_RESPONSE_BYTES);
    
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
    if (err instanceof Error && (err as any).status === 413) {
      return res.status(413).json({ message: err.message, responseTime: elapsed });
    }
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

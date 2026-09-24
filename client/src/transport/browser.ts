import {
  DEFAULT_TIMEOUT_MS,
  isBinaryContentType,
  normalizeStatusText,
  TransportError,
  EXTENSION_INSTALL_URL,
  type OutboundRequest,
  type OutboundResponse,
  type Transport,
} from './types';

function buildBody(body: OutboundRequest['body']): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (typeof body === 'string') return body;
  if (body._isFormData) {
    const fd = new FormData();
    for (const item of body.items) {
      if (item.type === 'file') {
        const bytes = Uint8Array.from(atob(item.content), (c) => c.charCodeAt(0));
        fd.append(item.key, new Blob([bytes]), item.filename);
      } else {
        fd.append(item.key, item.value);
      }
    }
    return fd;
  }
  return undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (maxBytes > 0 && total + value.length > maxBytes) {
      chunks.push(value.subarray(0, Math.max(0, maxBytes - total)));
      total = maxBytes;
      truncated = true;
      try { await reader.cancel(); } catch { /* stream already closing */ }
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return { bytes: out, truncated };
}

async function send(req: OutboundRequest): Promise<OutboundResponse> {
  const started = performance.now();
  const timeout = req.timeout > 0 ? req.timeout : DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeout);
  if (req.signal) {
    if (req.signal.aborted) ctrl.abort(req.signal.reason);
    else req.signal.addEventListener('abort', () => ctrl.abort(req.signal!.reason), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : buildBody(req.body),
      redirect: req.followRedirects ? 'follow' : 'manual',
      // A plain browser tab cannot skip TLS verification or attach a client
      // certificate — that requires the Electron or extension transport.
      signal: ctrl.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (ctrl.signal.aborted && ctrl.signal.reason === 'timeout') {
      throw new TransportError('TIMEOUT', { message: `Request timed out after ${timeout}ms.` });
    }
    if (e?.name === 'AbortError') {
      throw e; // user-initiated cancel — let the caller's own abort handling deal with it
    }
    // A CORS rejection surfaces as a TypeError with no status, indistinguishable
    // from a DNS failure or a refused connection at the fetch() API level.
    let origin = req.url;
    try { origin = new URL(req.url).origin; } catch { /* leave raw url */ }
    throw new TransportError('CORS_BLOCKED', {
      message:
        `The browser blocked this request to ${origin}. This is either a CORS restriction ` +
        `(the target server does not allow cross-origin calls from a page) or a network error. ` +
        `Install the Reqspace extension, or use the desktop app, to send it.`,
      installUrl: EXTENSION_INSTALL_URL,
    });
  }
  clearTimeout(timer);

  const headers: Record<string, string> = {};
  // Only CORS-safelisted / explicitly exposed headers are visible here — the
  // extension transport (SEC-0.7) exists specifically to see the rest.
  response.headers.forEach((v, k) => { headers[k] = v; });

  const { bytes, truncated } = await readCapped(response.body, req.maxResponseBytes);
  const responseTime = Math.round(performance.now() - started);
  const contentType = headers['content-type'] || '';
  const isBase64 = isBinaryContentType(contentType);
  const body = isBase64 ? bytesToBase64(bytes) : new TextDecoder('utf-8').decode(bytes);

  return {
    status: response.status,
    statusText: normalizeStatusText(response.status, response.statusText),
    headers,
    body,
    isBase64,
    responseTime,
    size: bytes.length,
    truncated,
  };
}

async function isAvailable(): Promise<boolean> {
  return true; // always the last-resort fallback
}

export const browserTransport: Transport = {
  name: 'browser',
  isAvailable,
  send,
};

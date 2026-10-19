import type { Transport, TransportRequest, TransportResponse } from './types';

// Header names fetch() silently drops (WHATWG "forbidden header names").
const FORBIDDEN_HEADERS = new Set([
  'host', 'origin', 'user-agent', 'cookie', 'referer', 'connection', 'content-length',
  'accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'date', 'dnt', 'expect', 'keep-alive', 'te',
  'trailer', 'transfer-encoding', 'upgrade', 'via',
]);

/** fetch() only accepts ISO-8859-1 header values; send other text as UTF-8 bytes. */
export function toHeaderSafeValue(value: string): string {
  const stripped = value.replace(/[\r\n]+/g, ' ');
  if (!/[^\u0000-\u00ff]/.test(stripped)) return stripped;
  let out = '';
  new TextEncoder().encode(stripped).forEach((b) => { out += String.fromCharCode(b); });
  return out;
}

/** What a plain browser fetch() cannot honor for this request - shown to the user instead of failing silently. */
export function getBrowserTransportWarnings(req: Pick<TransportRequest, 'headers' | 'verifySsl' | 'localProxy'>): string[] {
  const warnings: string[] = [];
  const dropped = Object.keys(req.headers || {}).filter((k) => FORBIDDEN_HEADERS.has(k.toLowerCase()) || /^(sec-|proxy-)/i.test(k));
  if (dropped.length) {
    warnings.push(`The browser does not allow setting these headers, so they were not sent: ${dropped.join(', ')}. Use the Reqspace Desktop App or Browser Extension to send them.`);
  }
  if (req.verifySsl === false) {
    warnings.push('"Verify SSL" is off, but a web browser cannot skip certificate checks, so self-signed/invalid certificates will still fail. Use the Desktop App or Browser Extension.');
  }
  if (req.localProxy) {
    warnings.push('A local proxy is configured, but a web browser cannot route requests through a proxy - the request is sent directly. Use the Desktop App or Browser Extension.');
  }
  return warnings;
}

export class BrowserTransport implements Transport {
  async send(req: TransportRequest): Promise<TransportResponse> {
    const startTime = Date.now();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers || {})) headers.append(k, toHeaderSafeValue(String(v)));
    const fetchOptions: RequestInit = {
      method: req.method.toUpperCase(),
      headers,
    };
    
    if (!['GET', 'HEAD'].includes(req.method.toUpperCase()) && req.body !== undefined) {
      if (req.body._isFormData) {
        const formData = new FormData();
        for (const item of req.body.items) {
          if (item.type === 'file') {
            // Note: In browser, full file path might not be available or base64 decoding needed
            const buffer = Uint8Array.from(atob(item.content), c => c.charCodeAt(0));
            const blob = new Blob([buffer]);
            formData.append(item.key, blob, item.filename);
          } else {
            formData.append(item.key, item.value);
          }
        }
        fetchOptions.body = formData;
      } else {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    const controller = new AbortController();
    let timeoutId: any;
    if (req.timeout && req.timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), req.timeout);
    }
    if (req.signal) {
      if (req.signal.aborted) controller.abort();
      else req.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    fetchOptions.signal = controller.signal;
    if (req.followRedirects === false) {
      fetchOptions.redirect = 'manual';
    }

    try {
      const response = await fetch(req.url, fetchOptions);
      if (timeoutId) clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const arrayBuffer = await response.arrayBuffer();
      
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });

      const contentType = (responseHeaders['content-type'] || '').toLowerCase();
      const isBinary = contentType.includes('image/') || contentType.includes('application/pdf') || contentType.includes('audio/') || contentType.includes('video/') || contentType.includes('application/octet-stream');
      
      // Basic buffer to string conversion for browser
      let responseBody = '';
      if (isBinary) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        responseBody = btoa(binary);
      } else {
        responseBody = new TextDecoder('utf-8').decode(arrayBuffer);
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        isBase64: isBinary,
        responseTime,
        size: arrayBuffer.byteLength,
      };
    } catch (err: unknown) {
      const elapsed = Date.now() - startTime;
      if (err instanceof Error && err.name === 'AbortError') {
        if (req.signal?.aborted) {
          const canceled = new Error('canceled');
          canceled.name = 'CanceledError';
          throw canceled;
        }
        throw new Error(`Request timed out after ${elapsed}ms`);
      }
      throw err;
    }
  }
}

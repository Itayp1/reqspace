import type { TransportRequest, TransportResponse } from './types';
import { BrowserTransport } from './browser';
import { ElectronTransport } from './electron';
import { ExtensionTransport } from './extension';
import { isExtensionInstalled } from './extension';

export * from './types';
export * from './browser';
export * from './electron';
export * from './extension';

export function getTransport() {
  // Re-evaluated on every call so that the extension is picked up as soon as
  // its PONG arrives (which is async — the PING fires at module load time but
  // the reply from the content script can lag by tens of milliseconds, meaning
  // a cached singleton would lock in BrowserTransport before the extension has
  // had a chance to respond).  All three transport classes are stateless so
  // constructing a new instance each time is negligible.
  if ((window as any).electron) return new ElectronTransport();
  if (isExtensionInstalled()) return new ExtensionTransport();
  return new BrowserTransport();
}

/**
 * An empty URL used to reach fetch('') — the app's own page — and "succeed"
 * with a 200, and a URL typed without a scheme ("api.example.com/users") was
 * resolved against the app's origin and came back as the app's index.html.
 * Reject the first; default the second to http://, as Postman does.
 */
export function normalizeRequestUrl(raw: string): string {
  const url = (raw || '').trim();
  if (!url) throw Object.assign(new Error('Enter a request URL'), { code: 'EMPTY_URL' });
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]
    ?? /^(javascript|data|file|ftp|vbscript|blob|mailto):/i.exec(url)?.[1];
  if (scheme) {
    if (!/^https?$/i.test(scheme)) {
      throw Object.assign(new Error(`Unsupported protocol "${scheme.toLowerCase()}:" - only http:// and https:// URLs can be sent`), { code: 'UNSUPPORTED_PROTOCOL' });
    }
    return url;
  }
  if (url.startsWith('//')) return `http:${url}`;
  return `http://${url}`;
}

export function sendRequest(req: TransportRequest): Promise<TransportResponse> {
  let url: string;
  try {
    url = normalizeRequestUrl(req.url);
  } catch (err) {
    return Promise.reject(err);
  }
  // fetch() refuses URLs that embed credentials, so lift user:pass@ out of the
  // URL and send it as a Basic Authorization header (unless one is already set).
  let headers = req.headers;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      const user = decodeURIComponent(parsed.username);
      const pass = decodeURIComponent(parsed.password);
      parsed.username = '';
      parsed.password = '';
      url = parsed.toString();
      const hasAuth = Object.keys(headers || {}).some((k) => k.toLowerCase() === 'authorization');
      if (!hasAuth) {
        const bytes = new TextEncoder().encode(`${user}:${pass}`);
        let bin = '';
        bytes.forEach((b) => { bin += String.fromCharCode(b); });
        headers = { ...(headers || {}), Authorization: `Basic ${btoa(bin)}` };
      }
    }
  } catch { /* unparseable URL: let the transport report it */ }
  const sent = getTransport().send({ ...req, url, headers });
  const { signal } = req;
  if (!signal) return sent;
  // Transports that can't cancel natively (extension, Electron) still stop
  // being waited on as soon as the caller aborts.
  return Promise.race([
    sent,
    new Promise<never>((_, reject) => {
      const abort = () => reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }),
  ]);
}

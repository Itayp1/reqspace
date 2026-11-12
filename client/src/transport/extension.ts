import type { Transport, TransportRequest, TransportResponse } from './types';

/** Thrown by ExtensionTransport when the extension is not installed/enabled. */
export const EXTENSION_NOT_INSTALLED_ERROR = 'EXTENSION_NOT_INSTALLED';

let extensionVersion: string | null = null;
let pendingRequests: Map<string, (res: TransportResponse) => void> = new Map();

// Listen for messages from the extension's content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'reqspace-extension') return;

  if (event.data.type === 'REQSPACE_PONG') {
    extensionVersion = event.data.version;
  } else if (event.data.type === 'REQSPACE_RESPONSE') {
    const resolve = pendingRequests.get(event.data.id);
    if (resolve) {
      pendingRequests.delete(event.data.id);
      
      const res = event.data.response;
      if (res.error) {
        resolve({
          status: 0,
          statusText: 'Error',
          headers: {},
          body: res.error,
          isBase64: false,
          responseTime: 0,
          size: 0,
        });
      } else {
        resolve({
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
          body: res.body,
          isBase64: !!res.isBase64,
          responseTime: res.time ?? 0,
          size: res.size ?? (res.body ? res.body.length : 0),
        });
      }
    }
  }
});

// Broadcast ping to see if extension is present
window.postMessage({ source: 'reqspace-client', type: 'REQSPACE_PING' }, '*');

export function isExtensionInstalled(): boolean {
  return extensionVersion !== null;
}

export class ExtensionTransport implements Transport {
  async send(req: TransportRequest): Promise<TransportResponse> {
    if (!isExtensionInstalled()) {
      const err = new Error('Reqspace extension is not installed or not enabled for this origin');
      (err as any).code = EXTENSION_NOT_INSTALLED_ERROR;
      throw err;
    }

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2);
      pendingRequests.set(id, resolve);
      if (req.signal) {
        const onAbort = () => {
          // Tell the extension to abort the in-flight fetch, and settle now.
          window.postMessage({ source: 'reqspace-client', type: 'REQSPACE_CANCEL', id }, '*');
          pendingRequests.delete(id);
          const err = new Error('canceled');
          err.name = 'CanceledError';
          reject(err);
        };
        if (req.signal.aborted) { onAbort(); return; }
        req.signal.addEventListener('abort', onAbort, { once: true });
      }

      window.postMessage({
        source: 'reqspace-client',
        type: 'REQSPACE_SEND',
        id,
        payload: {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: req.body,
          // Per-user client-side proxy setting; the extension applies it via chrome.proxy.
          localProxy: req.localProxy
        }
      }, '*');
    });
  }
}

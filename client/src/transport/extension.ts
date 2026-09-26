import type { Transport, TransportRequest, TransportResponse } from './types';

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
        // Return a 0 status with the error as body, or similar
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
          size: res.body ? res.body.length : 0,
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
      throw new Error('Reqspace extension is not installed or not enabled for this origin');
    }

    return new Promise((resolve) => {
      const id = Math.random().toString(36).substring(2);
      pendingRequests.set(id, resolve);

      window.postMessage({
        source: 'reqspace-client',
        type: 'REQSPACE_SEND',
        id,
        payload: {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: req.body
        }
      }, '*');
    });
  }
}

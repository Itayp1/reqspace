import { TransportError, type OutboundRequest, type OutboundResponse, type Transport } from './types';

// Talks to the Reqspace Chrome extension (extension/, built in SEC-0.7) over
// `externally_connectable` — no content script, just chrome.runtime.sendMessage
// against the extension's fixed id. See SEC-0.7.2 for the message contract.

const PROTOCOL_VERSION = 1;
const PING_TIMEOUT_MS = 300;

function extensionId(): string | undefined {
  return (import.meta as any).env?.VITE_EXTENSION_ID || undefined;
}

function chromeRuntime(): { sendMessage: Function } | undefined {
  return (window as any).chrome?.runtime;
}

let cachedPing: boolean | null = null;

async function ping(): Promise<boolean> {
  const id = extensionId();
  const runtime = chromeRuntime();
  if (!id || !runtime?.sendMessage) return false;
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(false); }
    }, PING_TIMEOUT_MS);
    try {
      runtime.sendMessage(id, { v: PROTOCOL_VERSION, type: 'ping' }, (response: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // chrome.runtime.lastError (e.g. no such extension) leaves response undefined.
        resolve(!!response?.ok);
      });
    } catch {
      if (!settled) { settled = true; clearTimeout(timer); resolve(false); }
    }
  });
}

async function isAvailable(): Promise<boolean> {
  if (cachedPing !== null) return cachedPing;
  cachedPing = await ping();
  return cachedPing;
}

// Call after the extension installs/uninstalls, or on window focus, so a
// stale "unavailable" verdict doesn't stick for the rest of the session.
export function resetExtensionPing() {
  cachedPing = null;
}

async function send(req: OutboundRequest): Promise<OutboundResponse> {
  const id = extensionId();
  const runtime = chromeRuntime();
  if (!id || !runtime?.sendMessage) {
    throw new TransportError('UNKNOWN', { message: 'The Reqspace extension is not connected.' });
  }

  const msg = {
    v: PROTOCOL_VERSION,
    type: 'send' as const,
    id: crypto.randomUUID(),
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    followRedirects: req.followRedirects,
    verifySsl: req.verifySsl,
    timeout: req.timeout,
    maxResponseBytes: req.maxResponseBytes,
  };

  return new Promise<OutboundResponse>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The user aborted a request.', 'AbortError'));
    if (req.signal) {
      if (req.signal.aborted) return onAbort();
      req.signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      runtime.sendMessage(id, msg, (response: any) => {
        if (req.signal) req.signal.removeEventListener('abort', onAbort);
        if (!response) {
          reject(new TransportError('UNKNOWN', { message: 'The Reqspace extension did not respond.' }));
          return;
        }
        if (response.v && response.v < PROTOCOL_VERSION) {
          reject(new TransportError('UNKNOWN', {
            message: 'The installed Reqspace extension is out of date. Please update it.',
          }));
          return;
        }
        if (!response.ok) {
          reject(new TransportError((response.error?.code as any) || 'UNKNOWN', {
            message: response.error?.message || 'The extension failed to send this request.',
          }));
          return;
        }
        const { ok: _ok, id: _id, v: _v, ...rest } = response;
        resolve(rest as OutboundResponse);
      });
    } catch (e: any) {
      if (req.signal) req.signal.removeEventListener('abort', onAbort);
      reject(new TransportError('UNKNOWN', { message: e?.message || 'Failed to reach the extension.' }));
    }
  });
}

export const extensionTransport: Transport = {
  name: 'extension',
  isAvailable,
  send,
};

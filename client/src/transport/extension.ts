import type { OversizedResponse, Transport, TransportRequest, TransportResponse } from './types';
import { MAX_RESPONSE_BYTES } from './browser';

/** Thrown by ExtensionTransport when the extension is not installed/enabled. */
export const EXTENSION_NOT_INSTALLED_ERROR = 'EXTENSION_NOT_INSTALLED';

let extensionVersion: string | null = null;
let extensionBlocked = false;
const listeners = new Set<() => void>();
/** Re-renders subscribers when the extension reports installed / not allowed for this origin. */
export function onExtensionStatus(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** The extension is installed but this site's origin is not in its allowlist. */
export function isExtensionBlocked(): boolean { return extensionBlocked && extensionVersion === null; }
/** Asks the extension to add this origin (it shows its own confirmation). */
export function requestExtensionOrigin() { window.postMessage({ source: 'reqspace-client', type: 'REQSPACE_ADD_ORIGIN' }, '*'); }
let pendingRequests: Map<string, (res: TransportResponse) => void> = new Map();

/** A response whose body arrives as REQSPACE_CHUNK messages; the extension pauses after a window of unacked chunks. */
interface BodyStream {
  head: any;
  chunks: Uint8Array[];
  total: number;
  ended: boolean;
  capped: boolean;
  resolve: (res: TransportResponse) => void;
  oversized?: OversizedResponse;
  sink?: { write(c: Uint8Array): Promise<void> };
  chain: Promise<void>;
  finish?: () => void;
  fail?: (message: string) => void;
}
const streams = new Map<string, BodyStream>();
const ack = (id: string) => window.postMessage({ source: 'reqspace-client', type: 'REQSPACE_ACK', id }, '*');
const cancel = (id: string) => window.postMessage({ source: 'reqspace-client', type: 'REQSPACE_CANCEL', id }, '*');

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as any);
  return btoa(bin);
}

function startStream(id: string, head: any, resolve: (res: TransportResponse) => void) {
  const s: BodyStream = { head, chunks: [], total: 0, ended: false, capped: false, resolve, chain: Promise.resolve() };
  streams.set(id, s);
  // A declared size over the cap is known up front: take nothing, so the extension stalls after its first window.
  if ((head.size || 0) > MAX_RESPONSE_BYTES) capStream(id, s);
}

function streamResponse(s: BodyStream, bytes: Uint8Array | null): TransportResponse {
  const { head } = s;
  const base = { status: head.status, statusText: head.statusText, headers: head.headers, isBase64: !!head.isBase64, responseTime: head.time ?? 0 };
  if (!bytes) return { ...base, body: '', isBase64: false, size: head.size || s.total, oversized: s.oversized };
  return { ...base, body: head.isBase64 ? bytesToBase64(bytes) : new TextDecoder('utf-8').decode(bytes), size: bytes.length };
}

function capStream(id: string, s: BodyStream) {
  s.capped = true;
  const picker = (window as any).showSaveFilePicker as undefined | ((o: { suggestedName: string }) => Promise<any>);
  const oversized: OversizedResponse = {
    sizeKnown: (s.head.size || 0) > 0,
    canSaveToFile: typeof picker === 'function',
    state: 'pending',
    saveToFile: async (suggestedName) => {
      oversized.state = 'saving';
      let handle: any;
      try { handle = await picker!({ suggestedName }); } catch { oversized.state = 'pending'; return false; }
      const writable = await handle.createWritable();
      const done = new Promise<void>((resolve, reject) => { s.finish = resolve; s.fail = (m) => reject(new Error(m)); });
      // Chunks already held go first; later ones are written as they arrive (see onChunk), each acked once written.
      s.sink = writable;
      s.chain = s.chain.then(async () => { for (const c of s.chunks.splice(0)) { await writable.write(c); ack(id); } });
      if (s.ended) s.chain.then(() => s.finish?.());
      try {
        await done;
        await writable.close();
        oversized.state = 'saved';
      } catch {
        await writable.abort?.().catch(() => {});
        oversized.state = 'failed';
      }
      streams.delete(id);
      return true;
    },
    discard: () => {
      if (oversized.state === 'saved' || oversized.state === 'saving') return;
      s.chunks.length = 0;
      cancel(id);
      streams.delete(id);
      oversized.state = 'discarded';
    },
  };
  s.oversized = oversized;
  s.resolve(streamResponse(s, null));
}

function onChunk(id: string, data: ArrayBuffer) {
  const s = streams.get(id);
  if (!s) return;
  const bytes = new Uint8Array(data);
  s.total += bytes.length;
  if (s.sink) {
    const sink = s.sink;
    s.chain = s.chain.then(async () => { await sink.write(bytes); ack(id); }).catch((e) => s.fail?.(String(e?.message || e)));
    return;
  }
  s.chunks.push(bytes);
  if (s.capped) return; // not acked: the extension stalls until the user saves or discards
  if (s.total > MAX_RESPONSE_BYTES) { capStream(id, s); return; }
  ack(id);
}

function onEnd(id: string) {
  const s = streams.get(id);
  if (!s) return;
  s.ended = true;
  if (s.sink) { s.chain.then(() => s.finish?.()); return; }
  if (s.capped) return; // finishes when the user saves
  const all = new Uint8Array(s.total);
  let offset = 0;
  for (const c of s.chunks) { all.set(c, offset); offset += c.length; }
  streams.delete(id);
  s.resolve(streamResponse(s, all));
}

// Listen for messages from the extension's content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'reqspace-extension') return;

  if (event.data.type === 'REQSPACE_PONG') {
    extensionVersion = event.data.version;
    listeners.forEach((fn) => fn());
  } else if (event.data.type === 'REQSPACE_NOT_ALLOWED') {
    extensionBlocked = true;
    listeners.forEach((fn) => fn());
  } else if (event.data.type === 'REQSPACE_CHUNK') {
    onChunk(event.data.id, event.data.data);
  } else if (event.data.type === 'REQSPACE_END') {
    onEnd(event.data.id);
  } else if (event.data.type === 'REQSPACE_RESPONSE') {
    const id = event.data.id;
    const res = event.data.response;
    const stream = streams.get(id);
    if (stream && res.error) {
      // The extension died mid-body: a pending save fails, an unsaved download is dropped.
      streams.delete(id);
      if (stream.capped) stream.fail?.(res.error);
      else stream.resolve({ status: 0, statusText: 'Error', headers: {}, body: res.error, isBase64: false, responseTime: 0, size: 0 });
      return;
    }
    const resolve = pendingRequests.get(id);
    if (resolve) {
      pendingRequests.delete(id);
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
      } else if (res.stream) {
        startStream(id, res, resolve);
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

/** The installed extension's version, once it has answered the ping. */
export function getExtensionVersion(): string | null {
  return extensionVersion;
}

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
          if (!streams.get(id)?.capped) streams.delete(id);
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

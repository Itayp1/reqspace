import { useAuthStore } from '../store/authStore';
import { TransportError, type OutboundRequest, type OutboundResponse, type Transport } from './types';

interface ReqspaceBridge {
  send(req: OutboundRequest & { clientCert?: { cert: string; key: string; passphrase?: string } }): Promise<
    | { ok: true; response: OutboundResponse }
    | { ok: false; error: { code: string; message: string } }
  >;
}

function bridge(): ReqspaceBridge | undefined {
  return (window as any).reqspace as ReqspaceBridge | undefined;
}

// The old server-side proxy matched a client certificate to the target host
// automatically (proxy.ts, deleted in SEC-0.4). Only the Electron main
// process can present a client cert during the TLS handshake, so that
// matching now happens here, once, right before the IPC call.
function matchClientCert(hostname: string): { cert: string; key: string; passphrase?: string } | undefined {
  const certs = useAuthStore.getState().user?.clientCertificates || [];
  for (const c of certs) {
    if (c.hostname === hostname) return { cert: c.cert, key: c.key, passphrase: c.passphrase };
    if (typeof c.hostname === 'string' && c.hostname.startsWith('*.')) {
      const domain = c.hostname.substring(2);
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { cert: c.cert, key: c.key, passphrase: c.passphrase };
      }
    }
  }
  return undefined;
}

async function send(req: OutboundRequest): Promise<OutboundResponse> {
  const b = bridge();
  if (!b) {
    throw new TransportError('UNKNOWN', { message: 'The desktop transport is unavailable in this window.' });
  }

  let hostname = '';
  try { hostname = new URL(req.url).hostname; } catch { /* invalid URL — let main process reject it */ }
  const clientCert = matchClientCert(hostname);

  const result = await b.send({ ...req, signal: undefined, clientCert });
  if (!result.ok) {
    throw new TransportError((result.error.code as any) || 'UNKNOWN', { message: result.error.message });
  }
  return result.response;
}

async function isAvailable(): Promise<boolean> {
  return typeof bridge()?.send === 'function';
}

export const electronTransport: Transport = {
  name: 'electron',
  isAvailable,
  send,
};

import { electronTransport } from './electron';
import { extensionTransport } from './extension';
import { browserTransport } from './browser';
import { DEFAULT_TIMEOUT_MS, type OutboundRequest, type OutboundResponse, type Transport } from './types';

export * from './types';
export { resetExtensionPing } from './extension';

let cached: Transport | null = null;

export async function getTransport(): Promise<Transport> {
  if (cached) return cached;
  for (const t of [electronTransport, extensionTransport, browserTransport]) {
    if (await t.isAvailable()) { cached = t; return t; }
  }
  return browserTransport; // always last-resort
}

// Call when the extension installs/uninstalls, or when the active transport
// just failed and a re-probe might pick a better one (e.g. the extension came
// online after the app loaded).
export function resetTransport() {
  cached = null;
}

export async function sendRequest(req: Partial<OutboundRequest> & Pick<OutboundRequest, 'method' | 'url' | 'headers'>): Promise<OutboundResponse> {
  const full: OutboundRequest = {
    followRedirects: true,
    verifySsl: true,
    timeout: DEFAULT_TIMEOUT_MS,
    maxResponseBytes: 50 * 1024 * 1024,
    ...req,
  };
  return (await getTransport()).send(full);
}

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

export function sendRequest(req: TransportRequest): Promise<TransportResponse> {
  return getTransport().send(req);
}

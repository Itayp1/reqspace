import type { Transport, TransportRequest, TransportResponse } from './types';
import { BrowserTransport } from './browser';
import { ElectronTransport } from './electron';
import { ExtensionTransport, isExtensionInstalled } from './extension';

export * from './types';
export * from './browser';
export * from './electron';
export * from './extension';

let activeTransport: Transport | null = null;

export function getTransport(): Transport {
  if (activeTransport) return activeTransport;

  // For testing in browser, use BrowserTransport as fallback, even though it will be limited by CORS
  if ((window as any).electron) {
    activeTransport = new ElectronTransport();
  } else if (isExtensionInstalled()) {
    activeTransport = new ExtensionTransport();
  } else {
    activeTransport = new BrowserTransport();
  }

  return activeTransport;
}

export function setTransport(transport: Transport) {
  activeTransport = transport;
}

export function sendRequest(req: TransportRequest): Promise<TransportResponse> {
  return getTransport().send(req);
}

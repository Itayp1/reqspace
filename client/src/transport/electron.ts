import type { Transport, TransportRequest, TransportResponse } from './types';

let nextId = 0;

export class ElectronTransport implements Transport {
  async send(req: TransportRequest): Promise<TransportResponse> {
    const api = (window as any).electron;
    if (!api) throw new Error('Electron API not available');
    // An AbortSignal can't cross the IPC boundary; forward aborts by request id.
    const { signal, ...payload } = req;
    const id = `req-${Date.now()}-${nextId++}`;
    const onAbort = () => api.abortRequest?.(id);
    if (signal) {
      if (signal.aborted) throw Object.assign(new Error('canceled'), { name: 'CanceledError' });
      signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const res = await api.sendRequest(payload, id);
      if (res && res.error) {
        if (res.canceled) throw Object.assign(new Error('canceled'), { name: 'CanceledError' });
        return { status: 0, statusText: 'Error', headers: {}, body: res.error, isBase64: false, responseTime: 0, size: 0 };
      }
      return res;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

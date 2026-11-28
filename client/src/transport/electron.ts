import type { OversizedResponse, Transport, TransportRequest, TransportResponse } from './types';

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
      if (res?.oversized) {
        const { id, sizeKnown } = res.oversized;
        const oversized: OversizedResponse = {
          sizeKnown,
          canSaveToFile: typeof api.saveOversized === 'function',
          state: 'pending',
          saveToFile: async (suggestedName) => {
            oversized.state = 'saving';
            const r = await api.saveOversized(id, suggestedName);
            if (r.canceled) { oversized.state = 'pending'; return false; }
            oversized.state = r.ok ? 'saved' : 'failed';
            return true;
          },
          discard: () => {
            if (oversized.state === 'saved' || oversized.state === 'saving') return;
            api.discardOversized?.(id);
            oversized.state = 'discarded';
          },
        };
        return { ...res, oversized };
      }
      return res;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

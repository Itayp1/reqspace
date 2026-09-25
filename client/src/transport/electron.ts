import { Transport, TransportRequest, TransportResponse } from './types';

export class ElectronTransport implements Transport {
  async send(req: TransportRequest): Promise<TransportResponse> {
    if (!(window as any).electron) {
      throw new Error('Electron API not available');
    }
    return await (window as any).electron.sendRequest(req);
  }
}

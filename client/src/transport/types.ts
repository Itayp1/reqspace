export interface TransportRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  cert?: {
    cert: string;
    key: string;
    passphrase?: string;
  };
  followRedirects?: boolean;
  timeout?: number;
  verifySsl?: boolean;
  localProxy?: any;
}

export interface TransportResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string | null;
  isBase64: boolean;
  responseTime: number;
  size: number;
}

export interface Transport {
  send(req: TransportRequest): Promise<TransportResponse>;
}

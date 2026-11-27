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
  /** All of the user's client certificates; the Desktop transport picks one by hostname. */
  clientCertificates?: { hostname: string; cert: string; key: string; passphrase?: string }[];
  followRedirects?: boolean;
  timeout?: number;
  verifySsl?: boolean;
  localProxy?: any;
  /** Aborts the in-flight request (browser + extension transports). */
  signal?: AbortSignal;
}

/** A body over MAX_RESPONSE_BYTES: it is not buffered or shown; the open download can be streamed to disk or dropped. */
export interface OversizedResponse {
  /** false when the server sent no Content-Length, so the size is only "over the limit". */
  sizeKnown: boolean;
  canSaveToFile: boolean;
  state: 'pending' | 'saving' | 'saved' | 'discarded' | 'failed';
  /** Opens the save dialog first, so call it straight from a click. Resolves false if the user cancels the dialog. */
  saveToFile: (suggestedName: string) => Promise<boolean>;
  discard: () => void;
}

export interface TransportResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string | null;
  isBase64: boolean;
  responseTime: number;
  size: number;
  oversized?: OversizedResponse;
}

export interface Transport {
  send(req: TransportRequest): Promise<TransportResponse>;
}

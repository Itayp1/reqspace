// The shape every transport speaks. Kept identical across Electron, the
// Chrome extension and the plain-browser fallback so UI code never has to
// know which one is actually sending the request. See TODO.md SEC-0.2.

export interface FormDataPayload {
  _isFormData: true;
  items: Array<
    | { type: 'text'; key: string; value: string }
    | { type: 'file'; key: string; filename: string; content: string /* base64 */ }
  >;
}

export interface OutboundRequest {
  method: string; // 'GET' | 'POST' | ...
  url: string; // already variable-resolved by the caller
  headers: Record<string, string>;
  body?: string | FormDataPayload | undefined;
  followRedirects: boolean;
  verifySsl: boolean;
  timeout: number; // ms; 0 is NOT allowed — see FEAT-9
  maxResponseBytes: number; // FEAT-9
  clientCertId?: string; // Electron only
  signal?: AbortSignal;
}

export interface OutboundResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string; // utf8, or base64 when isBase64
  isBase64: boolean;
  responseTime: number; // ms
  size: number; // bytes actually received
  truncated: boolean; // hit maxResponseBytes
  redirects?: Array<{ status: number; location: string }>;
}

export type TransportErrorCode =
  | 'CORS_BLOCKED'
  | 'TIMEOUT'
  | 'DNS'
  | 'REFUSED'
  | 'TOO_LARGE'
  | 'BAD_URL'
  | 'UNKNOWN';

export interface TransportErrorDetails {
  message: string;
  installUrl?: string;
}

export class TransportError extends Error {
  readonly code: TransportErrorCode;
  readonly installUrl?: string;

  constructor(code: TransportErrorCode, details: TransportErrorDetails) {
    super(details.message);
    this.name = 'TransportError';
    this.code = code;
    this.installUrl = details.installUrl;
  }
}

export interface Transport {
  readonly name: 'electron' | 'extension' | 'browser';
  isAvailable(): Promise<boolean>;
  send(req: OutboundRequest): Promise<OutboundResponse>;
}

// The default request timeout the UI falls back to when a caller passes 0 —
// 0 previously meant "no timeout" against the trusted Reqspace server; that
// is not an acceptable default for a request a client sends directly to an
// arbitrary third-party host (FEAT-9 tightens this further).
export const DEFAULT_TIMEOUT_MS = 30_000;

// Binary content types get base64-encoded before crossing back into JSON —
// the same rule the old server-side proxy used.
export const BINARY_CONTENT_TYPE_PREFIXES = ['image/', 'application/pdf', 'audio/', 'video/', 'application/octet-stream'];

export function isBinaryContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return BINARY_CONTENT_TYPE_PREFIXES.some((p) => ct.includes(p));
}

export const EXTENSION_INSTALL_URL = 'https://github.com/Itayp1/reqspace#chrome-extension';

// HTTP/2 (and HTTP/3) have no reason phrase on the wire, so a browser's
// fetch() leaves `statusText` empty for most real-world APIs today — unlike
// the old server-side proxy, which dialed out over HTTP/1.1 via undici and
// always got one. Backfill the standard phrase so the UI renders "200 OK"
// consistently regardless of which protocol the target actually spoke.
const STANDARD_STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

export function normalizeStatusText(status: number, statusText: string): string {
  if (statusText && statusText.trim()) return statusText;
  return STANDARD_STATUS_TEXT[status] || '';
}

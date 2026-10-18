export type ClientErrorKind = 'window.error' | 'unhandledrejection' | 'react-boundary' | 'api' | 'console';

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
  method?: string;
  status?: number;
}

const MAX_REPORTS_PER_PAGE = 100;
const DEDUPE_WINDOW_MS = 60_000;
const IGNORED_MESSAGE = /ResizeObserver loop/;

const lastSentAt = new Map<string, number>();
let sentCount = 0;

export function pathOnly(raw: string): string {
  try {
    return new URL(raw, window.location.origin).pathname;
  } catch {
    return '';
  }
}

export function reportClientError(report: ClientErrorReport): void {
  try {
    if (sentCount >= MAX_REPORTS_PER_PAGE) return;
    const message = (report.message || 'Unknown error').slice(0, 2000);
    if (IGNORED_MESSAGE.test(message)) return;

    const firstFrame = report.stack?.split('\n')[1] ?? '';
    const key = `${report.kind}|${message}|${firstFrame}`;
    const now = Date.now();
    const last = lastSentAt.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
    lastSentAt.set(key, now);
    sentCount += 1;

    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        kind: report.kind,
        message,
        stack: report.stack?.slice(0, 10000),
        componentStack: report.componentStack?.slice(0, 10000),
        route: report.route ?? window.location.pathname,
        method: report.method,
        status: report.status,
      }),
    }).catch(() => {});
  } catch {
    // Reporting must never raise into the code that triggered it.
  }
}

const formatConsoleArg = (a: unknown): string => {
  if (a instanceof Error) return a.stack ? `${a.message}
${a.stack}` : a.message;
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
};

/** Mirrors console.error / console.warn into the error store (still printing them as usual). */
function captureConsole(): void {
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        const text = args.map(formatConsoleArg).join(' ');
        const err = args.find((a): a is Error => a instanceof Error);
        reportClientError({ kind: 'console', message: `console.${level}: ${text}`, stack: err?.stack });
      } catch { /* never raise into the caller */ }
    };
  }
}

export function installGlobalErrorHandlers(): void {
  captureConsole();
  window.addEventListener('error', (event) => {
    reportClientError({
      kind: 'window.error',
      message: event.message,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    reportClientError({
      kind: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

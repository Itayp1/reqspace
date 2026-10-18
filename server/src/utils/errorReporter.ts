import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SqlFpError } from '../db/sql-models';

export interface FpErrorInput {
  source: 'client' | 'server';
  kind: string;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  route?: string | null;
  method?: string | null;
  status?: number | null;
  userId?: string | null;
  userAgent?: string | null;
}

// The e2e suite sets FPERRORS_DEDUPE_MS=0 so a fault that repeats on a retry
// is recorded again instead of being swallowed by the window.
const DEDUPE_WINDOW_MS = (() => {
  const n = Number(process.env.FPERRORS_DEDUPE_MS);
  return Number.isFinite(n) && n >= 0 && process.env.FPERRORS_DEDUPE_MS !== '' && process.env.FPERRORS_DEDUPE_MS !== undefined ? n : 60_000;
})();
const DEDUPE_SWEEP_THRESHOLD = 5_000;
// fingerprint -> when it was last stored and the id of that row, so repeats
// swallowed inside the window can still be counted on it.
const recentFingerprints = new Map<string, { at: number; id?: string }>();

const FALLBACK_PATH = path.join(process.cwd(), 'fperrors-fallback.jsonl');

const SECRET_PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/((?:token|password|passwd|secret|authorization|api[_-]?key)["']?\s*[:=]\s*["']?)[^"'&\s;,}]+/gi, '$1[redacted]'],
];

function redact(text: string): string {
  return SECRET_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

function clip(text: string | null | undefined, max: number): string | null {
  if (text == null) return null;
  const safe = redact(String(text));
  return safe.length > max ? safe.slice(0, max) : safe;
}

function fingerprintOf(source: string, kind: string, message: string, stack: string | null): string {
  const normalizedMessage = message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/gi, '#');
  const firstFrame = (stack ?? '').split('\n').find((line) => line.trim().startsWith('at ')) ?? '';
  return crypto.createHash('sha256').update([source, kind, normalizedMessage, firstFrame].join('|')).digest('hex');
}

function buildRow(input: FpErrorInput) {
  const kind = clip(input.kind, 40) ?? 'unknown';
  const message = clip(input.message, 2000) ?? 'Unknown error';
  const stack = clip(input.stack, 10000);
  return {
    source: input.source,
    kind,
    message,
    stack,
    componentStack: clip(input.componentStack, 10000),
    route: clip(input.route, 500),
    method: clip(input.method, 10),
    status: input.status ?? null,
    userId: input.userId ?? null,
    userAgent: clip(input.userAgent, 500),
    fingerprint: fingerprintOf(input.source, kind, message, stack),
  };
}

/** Returns the already-stored entry when this fingerprint was seen inside the window; otherwise registers it. */
function checkDuplicate(fingerprint: string, now: number): { at: number; id?: string } | null {
  const last = recentFingerprints.get(fingerprint);
  if (last !== undefined && now - last.at < DEDUPE_WINDOW_MS) return last;
  recentFingerprints.set(fingerprint, { at: now });
  if (recentFingerprints.size > DEDUPE_SWEEP_THRESHOLD) {
    for (const [key, seen] of recentFingerprints) {
      if (now - seen.at >= DEDUPE_WINDOW_MS) recentFingerprints.delete(key);
    }
  }
  return null;
}

function appendFallback(row: object): void {
  try {
    fs.appendFileSync(FALLBACK_PATH, JSON.stringify({ ...row, at: new Date().toISOString() }) + '\n');
  } catch (err) {
    console.error('[fperrors] fallback write failed:', (err as Error).message);
  }
}

/** Never rejects. Callers that must not block (request handlers) call it without awaiting. */
export async function recordError(input: FpErrorInput): Promise<void> {
  const row = buildRow(input);
  const seen = checkDuplicate(row.fingerprint, Date.now());
  if (seen) {
    // Suppressed, but still counted: the stored row keeps a tally so the
    // group's count reflects every occurrence, not just the first in a window.
    if (seen.id) {
      try { await SqlFpError.increment('repeats', { by: 1, where: { id: seen.id } }); } catch { /* best effort */ }
    }
    return;
  }
  try {
    const created = await SqlFpError.create(row);
    const entry = recentFingerprints.get(row.fingerprint);
    if (entry && (created as any)?.id) entry.id = (created as any).id;
  } catch (err) {
    console.error('[fperrors] insert failed, writing fallback file:', (err as Error).message);
    appendFallback(row);
  }
}

/** Remembers the real error behind a 5xx a route sends from its own catch block, so the response-finish hook records it instead of a bare status line. */
export function noteRouteError(res: { locals: Record<string, any> }, err: unknown): void {
  res.locals.routeError = err;
}

/** For errors the server catches and survives (background jobs, best-effort writes). Fire-and-forget. */
export function recordHandledError(kind: string, err: unknown, extra: Partial<FpErrorInput> = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  void recordError({ source: 'server', kind, message: e.message, stack: e.stack ?? null, ...extra });
}

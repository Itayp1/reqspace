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

const DEDUPE_WINDOW_MS = 60_000;
const DEDUPE_SWEEP_THRESHOLD = 5_000;
const recentFingerprints = new Map<string, number>();

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

function isDuplicate(fingerprint: string, now: number): boolean {
  const last = recentFingerprints.get(fingerprint);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;
  recentFingerprints.set(fingerprint, now);
  if (recentFingerprints.size > DEDUPE_SWEEP_THRESHOLD) {
    for (const [key, seenAt] of recentFingerprints) {
      if (now - seenAt >= DEDUPE_WINDOW_MS) recentFingerprints.delete(key);
    }
  }
  return false;
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
  if (isDuplicate(row.fingerprint, Date.now())) return;
  try {
    await SqlFpError.create(row);
  } catch (err) {
    console.error('[fperrors] insert failed, writing fallback file:', (err as Error).message);
    appendFallback(row);
  }
}

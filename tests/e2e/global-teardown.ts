/**
 * End-of-run fperrors check, reading the table directly.
 *
 * Each test (fixtures.ts) appends its window (start/end) and the patterns it
 * declared with `allowFpErrors` to test-results/.fperrors-allowed.jsonl. Here
 * every fperrors row recorded during the run is attributed to a test:
 *
 *  - a row created inside a test's window (up to 2s after its end, since
 *    server writes can land just after the response) belongs to that test;
 *  - a row created between tests belongs to the nearest preceding test.
 *
 * A row is allowed when a test it is attributed to declares a matching
 * pattern. Anything else is unexpected: it is printed with the test name(s),
 * written to test-results/fperrors-report.json, and fails the run.
 *
 * SQLite (the local default): the database file the webServer was started
 * with is opened read-only. Other backends: GET /api/admin/errors?since=<run start>.
 */
import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { removePerfData } from './perf-seed';
import { matches } from './fixtures';

interface Row { source: string; kind: string; message: string; route: string | null; fingerprint: string; createdAt: string }
interface Allowance { title: string; start: number; end: number; allow: Array<RegExp | string> }
interface Unexpected {
  source: string; kind: string; message: string; route: string | null; fingerprint: string;
  count: number; firstSeen: string; lastSeen: string;
  tests: string[]; attribution: 'during' | 'between-tests' | 'none';
}

const RESULTS_DIR = path.resolve(__dirname, '..', '..', process.env.REQSPACE_RESULTS_DIR || 'test-results');
const API_URL = process.env.REQSPACE_API_URL || 'http://localhost:3005';
const SETTLE_MS = Number(process.env.FPERRORS_SETTLE_MS || 750);
// Server-side writes from a test can land a moment after its window closed.
const SLACK_MS = 2000;

// SQLite stores "2026-11-28 10:00:00.000 +00:00"; the API returns ISO strings.
function toMs(ts: string): number {
  const iso = ts.replace(' ', 'T').replace(/\s*\+00:00$/, 'Z');
  return Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

function readSqlite(dbPath: string, since: string): Row[] | null {
  let Database: any;
  try {
    Database = require(path.join(__dirname, '..', '..', 'server', 'node_modules', 'better-sqlite3'));
  } catch {
    return null;
  }
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fperrors'").get();
    if (!exists) return [];
    // CI runs several Playwright projects against one server/file, so only rows since THIS run started count.
    return db.prepare(`
      SELECT source, kind, message, route, fingerprint, createdAt
      FROM fperrors WHERE datetime(createdAt) >= datetime(?) ORDER BY createdAt
    `).all(since) as Row[];
  } finally {
    db.close();
  }
}

async function readViaApi(since: string): Promise<Row[]> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': '10.255.0.2' } });
  try {
    let ok = false;
    for (const password of ['admin123456']) {
      const res = await ctx.post('/api/auth/login', { data: { email: 'admin', password } });
      if (res.ok()) { ok = true; break; }
    }
    if (!ok) throw new Error('could not log in as the seeded admin');
    const res = await ctx.get('/api/admin/errors', { params: { since, limit: '200' } });
    if (!res.ok()) throw new Error(`GET /api/admin/errors answered ${res.status()}`);
    const groups = (await res.json()).groups as Array<Row & { lastSeen: string }>;
    const rows: Row[] = [];
    for (const g of groups) {
      // Per-occurrence timestamps come from the group's occurrence list (newest 50).
      const occ = await ctx.get(`/api/admin/errors/${g.fingerprint}`);
      const items = occ.ok() ? (await occ.json()).items as Row[] : [];
      if (!items.length) rows.push({ source: g.source, kind: g.kind, message: g.message, route: g.route, fingerprint: g.fingerprint, createdAt: g.lastSeen });
      for (const it of items) rows.push({ source: it.source, kind: it.kind, message: it.message, route: it.route, fingerprint: it.fingerprint, createdAt: it.createdAt });
    }
    return rows;
  } finally {
    await ctx.dispose();
  }
}

// Tests of this run only (global-setup clears the file, the end-time filter guards against leftovers).
function readAllowances(sinceMs: number): Allowance[] {
  const file = path.join(RESULTS_DIR, '.fperrors-allowed.jsonl');
  const out: Allowance[] = [];
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    const start = Date.parse(e.start);
    const end = Date.parse(e.end);
    if (!e.test || Number.isNaN(start) || Number.isNaN(end) || end + SLACK_MS < sinceMs) continue;
    const allow = (e.allow ?? []).map((p: string | { re: string; flags: string }) => (typeof p === 'string' ? p : new RegExp(p.re, p.flags)));
    out.push({ title: e.test, start, end, allow });
  }
  return out;
}

function attribute(row: Row, tests: Allowance[]): { allowed: boolean; owners: string[]; attribution: Unexpected['attribution'] } {
  const t = toMs(row.createdAt);
  const during = tests.filter(a => t >= a.start && t <= a.end + SLACK_MS);
  let owners = during;
  let attribution: Unexpected['attribution'] = 'during';
  if (!owners.length) {
    let prev: Allowance | undefined;
    for (const a of tests) if (a.end <= t && (!prev || a.end > prev.end)) prev = a;
    owners = prev ? [prev] : [];
    attribution = prev ? 'between-tests' : 'none';
  }
  const allowed = owners.some(a => a.allow.some(p => matches(p, row)));
  return { allowed, owners: owners.map(a => a.title), attribution };
}

async function readRows(since: string): Promise<{ rows: Row[]; method: string } | null> {
  const dbType = process.env.DB_TYPE || 'sqlite';
  if (dbType === 'sqlite' && process.env.REQSPACE_E2E_DB_PATH) {
    const rows = readSqlite(process.env.REQSPACE_E2E_DB_PATH, since);
    if (rows) return { rows, method: `table fperrors in ${process.env.REQSPACE_E2E_DB_PATH}` };
  }
  try {
    return { rows: await readViaApi(since), method: `GET ${API_URL}/api/admin/errors?since=${since}` };
  } catch (err) {
    console.warn(`[fperrors] could not read the error table: ${(err as Error).message}`);
    return null;
  }
}

export default async function globalTeardown() {
  try { removePerfData(); } catch (err) { console.warn(`[perf-seed] cleanup failed: ${(err as Error).message}`); }
  if (process.env.FPERRORS_GUARD === 'off') return;
  const since = process.env.REQSPACE_E2E_RUN_STARTED || new Date(Date.now() - 6 * 3600_000).toISOString();

  // Fire-and-forget writes from the last test may still be landing.
  await new Promise(r => setTimeout(r, SETTLE_MS));
  const read = await readRows(since);
  if (!read) return;
  const { rows, method } = read;

  const tests = readAllowances(Date.parse(since));
  const groups = new Map<string, Unexpected>();
  let unexpectedRows = 0;
  for (const row of [...rows].sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))) {
    const { allowed, owners, attribution } = attribute(row, tests);
    if (allowed) continue;
    unexpectedRows++;
    const key = `${row.fingerprint}\u0000${attribution}\u0000${owners.join('\u0001')}`;
    const g = groups.get(key) ?? {
      source: row.source, kind: row.kind, message: row.message, route: row.route, fingerprint: row.fingerprint,
      count: 0, firstSeen: row.createdAt, lastSeen: row.createdAt, tests: owners, attribution,
    };
    g.count++;
    g.lastSeen = row.createdAt;
    groups.set(key, g);
  }
  const unexpected = [...groups.values()];

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, 'fperrors-report.json'), JSON.stringify({ source: method, total: rows.length, allowed: rows.length - unexpectedRows, unexpected }, null, 2));

  console.log(`\n[fperrors] ${rows.length} fault(s) recorded during the run (${rows.length - unexpectedRows} declared by tests) — read from ${method}`);
  if (!unexpected.length) {
    console.log('[fperrors] no unexpected faults.');
    return;
  }
  for (const g of unexpected) {
    const where = g.tests.length ? g.tests.join(' | ') : '(no test)';
    console.log(`  • [${g.source}/${g.kind}] ${String(g.message).slice(0, 200)}${g.route ? `  (${g.route})` : ''} ×${g.count}\n      test: ${where} (${g.attribution})`);
  }
  throw new Error(`[fperrors] ${unexpected.length} unexpected fault group(s) (${unexpectedRows} row(s)) were recorded during the run — see test-results/fperrors-report.json`);
}

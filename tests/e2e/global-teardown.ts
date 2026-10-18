/**
 * End-of-run fperrors check, reading the table directly.
 *
 * Each test already fails on the faults it causes (fixtures.ts asks the
 * backend). This pass looks at the `fperrors` table itself once the suite is
 * done, so faults recorded between tests or after the last one — a fork sync
 * that failed in the background, an exception thrown after a response was
 * sent — are not lost. It prints a summary, writes
 * test-results/fperrors-report.json, and fails the run if anything was
 * recorded that no test declared with `allowFpErrors`.
 *
 * SQLite (the local default): the database file the webServer was started
 * with is opened read-only. Other backends: GET /api/admin/errors?since=<run start>.
 */
import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { removePerfData } from './perf-seed';

interface Row { source: string; kind: string; message: string; route: string | null; fingerprint: string; count: number; firstSeen: string; lastSeen: string }

const RESULTS_DIR = path.resolve(__dirname, '..', '..', process.env.REQSPACE_RESULTS_DIR || 'test-results');
const API_URL = process.env.REQSPACE_API_URL || 'http://localhost:3005';

function readSqlite(dbPath: string): Row[] | null {
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
    // The file is created fresh for every run, so every row in it is this run's.
    return db.prepare(`
      SELECT MAX(source) AS source, MAX(kind) AS kind, MAX(message) AS message, MAX(route) AS route,
             fingerprint, COUNT(*) AS count, MIN(createdAt) AS firstSeen, MAX(createdAt) AS lastSeen
      FROM fperrors GROUP BY fingerprint ORDER BY lastSeen DESC
    `).all() as Row[];
  } finally {
    db.close();
  }
}

async function readViaApi(since: string): Promise<Row[]> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': '10.255.0.2' } });
  try {
    let ok = false;
    for (const password of [process.env.REQSPACE_ADMIN_PASSWORD, 'admin', 'admin123456'].filter(Boolean) as string[]) {
      const res = await ctx.post('/api/auth/login', { data: { email: process.env.REQSPACE_ADMIN_EMAIL || 'admin', password } });
      if (res.ok()) { ok = true; break; }
    }
    if (!ok) throw new Error('could not log in as the seeded admin');
    const res = await ctx.get('/api/admin/errors', { params: { since, limit: '200' } });
    if (!res.ok()) throw new Error(`GET /api/admin/errors answered ${res.status()}`);
    return (await res.json()).groups as Row[];
  } finally {
    await ctx.dispose();
  }
}

function allowedFingerprints(): Set<string> {
  const file = path.join(RESULTS_DIR, '.fperrors-allowed.jsonl');
  const out = new Set<string>();
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.add(JSON.parse(line).fingerprint); } catch { /* skip */ }
  }
  return out;
}

export default async function globalTeardown() {
  try { removePerfData(); } catch (err) { console.warn(`[perf-seed] cleanup failed: ${(err as Error).message}`); }
  if (process.env.FPERRORS_GUARD === 'off') return;
  const dbType = process.env.DB_TYPE || 'sqlite';
  const since = process.env.REQSPACE_E2E_RUN_STARTED || new Date(Date.now() - 6 * 3600_000).toISOString();

  let rows: Row[] | null = null;
  let method = '';
  if (dbType === 'sqlite' && process.env.REQSPACE_E2E_DB_PATH) {
    rows = readSqlite(process.env.REQSPACE_E2E_DB_PATH);
    method = `table fperrors in ${process.env.REQSPACE_E2E_DB_PATH}`;
  }
  if (rows === null) {
    try {
      rows = await readViaApi(since);
      method = `GET ${API_URL}/api/admin/errors?since=${since}`;
    } catch (err) {
      console.warn(`[fperrors] could not read the error table: ${(err as Error).message}`);
      return;
    }
  }

  const allowed = allowedFingerprints();
  const unexpected = rows.filter(r => !allowed.has(r.fingerprint));
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, 'fperrors-report.json'), JSON.stringify({ source: method, total: rows.length, allowed: rows.length - unexpected.length, unexpected }, null, 2));

  console.log(`\n[fperrors] ${rows.length} fault group(s) recorded during the run (${rows.length - unexpected.length} declared by tests) — read from ${method}`);
  if (!unexpected.length) {
    console.log('[fperrors] no unexpected faults.');
    return;
  }
  for (const r of unexpected) {
    console.log(`  • [${r.source}/${r.kind}] ${String(r.message).slice(0, 200)}${r.route ? `  (${r.route})` : ''} ×${r.count}`);
  }
  throw new Error(`[fperrors] ${unexpected.length} unexpected fault group(s) were recorded during the run — see test-results/fperrors-report.json`);
}

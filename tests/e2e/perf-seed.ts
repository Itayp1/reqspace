/**
 * Bulk data for the search-latency check. Rows go straight into the SQLite file the e2e server runs on
 * (6.2M rows is not reachable over HTTP), owned by one registered "perf" user, and are deleted again
 * by global-teardown.
 *
 * Shape: PERF_WORKSPACES workspaces × 200 collections × 5 folders × 5 requests (one per folder).
 * Names are `PerfWS-0042`, `PerfCol-0042-0117`, `PerfFolder-0042-0117-3`, `PerfReq-0042-0117-3-4`.
 * Defaults are small to keep runs fast; override the sizes with REQSPACE_PERF_WORKSPACES / _COLLECTIONS for quick local runs.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { request } from '@playwright/test';

export const PERF = {
  workspaces: Number(process.env.REQSPACE_PERF_WORKSPACES || 5),
  collections: Number(process.env.REQSPACE_PERF_COLLECTIONS || 200),
  folders: 5,
  requestsPerFolder: 5,
  password: 'password123',
};

const STATE_FILE = path.resolve(__dirname, '..', '..', process.env.REQSPACE_RESULTS_DIR || 'test-results', '.perf-seed.json');

export interface PerfState { email: string; userId: string; dbPath: string }

export const pad = (n: number, w: number) => String(n).padStart(w, '0');
export const wsName = (w: number) => `PerfWS-${pad(w, 4)}`;
export const colName = (w: number, c: number) => `PerfCol-${pad(w, 4)}-${pad(c, 4)}`;
export const folderName = (w: number, c: number, f: number) => `PerfFolder-${pad(w, 4)}-${pad(c, 4)}-${f}`;

export function readPerfState(): PerfState {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function openDb(dbPath: string) {
  const Database = require(path.join(__dirname, '..', '..', 'server', 'node_modules', 'better-sqlite3'));
  const db = new Database(dbPath, { fileMustExist: true, timeout: 120_000 });
  db.pragma('synchronous = OFF');
  db.pragma('temp_store = MEMORY');
  return db;
}

export async function seedPerfData(apiUrl: string, dbPath: string): Promise<PerfState> {
  const email = `perf_${Date.now()}@example.com`;
  const ctx = await request.newContext({ baseURL: apiUrl, extraHTTPHeaders: { 'X-Forwarded-For': '10.255.0.3' } });
  let userId: string;
  try {
    const res = await ctx.post('/api/auth/register', { data: { name: 'Perf User', email, password: PERF.password } });
    if (!res.ok()) throw new Error(`perf seed: register answered ${res.status()}: ${await res.text()}`);
    const body = await res.json();
    userId = String(body.user?._id ?? body.user?.id ?? body._id);
  } finally {
    await ctx.dispose();
  }
  if (!userId || userId === 'undefined') throw new Error('perf seed: could not read the new user id from /api/auth/register');

  const started = Date.now();
  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString().replace('T', ' ').replace('Z', ' +00:00');
    const insWs = db.prepare('INSERT INTO workspaces (id,name,description,ownerId,members,isPublic,isPersonal,createdAt,updatedAt) VALUES (?,?,?,?,?,0,0,?,?)');
    const insCol = db.prepare('INSERT INTO collections (id,workspaceId,name,description,variables,auth,preRequestScript,testScript,roles,"order",createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const insFolder = db.prepare('INSERT INTO folders (id,collectionId,parentFolderId,name,description,auth,preRequestScript,testScript,roles,"order",createdAt,updatedAt) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?)');
    const insReq = db.prepare('INSERT INTO requests (id,collectionId,folderId,name,method,url,params,headers,auth,body,settings,preRequestScript,testScript,description,"order",comments,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const members = JSON.stringify([{ userId, role: 'owner', joinedAt: now }]);
    const colAuth = '{"type":"none"}', folderAuth = '{"type":"inherit"}', body = '{"mode":"none"}';
    const id = (_kind: string) => randomUUID();

    for (let w = 0; w < PERF.workspaces; w++) {
      db.transaction(() => {
        const wsId = id('w');
        insWs.run(wsId, wsName(w), '', userId, members, now, now);
        for (let c = 0; c < PERF.collections; c++) {
          const colId = id('c');
          insCol.run(colId, wsId, colName(w, c), '', '[]', colAuth, '', '', '[]', c, userId, now, now);
          for (let f = 0; f < PERF.folders; f++) {
            const fId = id('f');
            insFolder.run(fId, colId, folderName(w, c, f), '', folderAuth, '', '', '[]', f, now, now);
            for (let r = 0; r < PERF.requestsPerFolder; r++) {
              insReq.run(id('r'), colId, fId, `PerfReq-${pad(w, 4)}-${pad(c, 4)}-${f}-${r}`, 'GET', `https://perf.example.com/${w}/${c}/${f}/${r}`,
                '[]', '[]', colAuth, body, '{}', '', '', '', r, '[]', userId, now, now);
            }
          }
        }
      })();
      if (w % 100 === 99) console.log(`[perf-seed] ${w + 1}/${PERF.workspaces} workspaces (${Math.round((Date.now() - started) / 1000)}s)`);
    }
  } finally {
    db.close();
  }
  const state: PerfState = { email, userId, dbPath };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  const total = PERF.workspaces * (1 + PERF.collections * (1 + PERF.folders * (1 + PERF.requestsPerFolder)));
  console.log(`[perf-seed] seeded ${total.toLocaleString()} rows in ${Math.round((Date.now() - started) / 1000)}s for ${email}`);
  return state;
}

/** Deletes everything seedPerfData created (found through the perf user's ownership of the workspaces) and the perf user. */
export function removePerfData(): void {
  if (!fs.existsSync(STATE_FILE)) return;
  const state = readPerfState();
  const started = Date.now();
  if (fs.existsSync(state.dbPath)) {
    const db = openDb(state.dbPath);
    try {
      db.transaction(() => {
        const ws = `SELECT id FROM workspaces WHERE ownerId = ? AND isPersonal = 0`;
        const cols = `SELECT id FROM collections WHERE workspaceId IN (${ws})`;
        db.prepare(`DELETE FROM requests WHERE collectionId IN (${cols})`).run(state.userId);
        db.prepare(`DELETE FROM folders WHERE collectionId IN (${cols})`).run(state.userId);
        db.prepare(`DELETE FROM collections WHERE workspaceId IN (${ws})`).run(state.userId);
        db.prepare(`DELETE FROM workspaces WHERE ownerId = ? AND isPersonal = 0`).run(state.userId);
      })();
    } finally {
      db.close();
    }
  }
  fs.rmSync(STATE_FILE, { force: true });
  console.log(`[perf-seed] removed seeded data in ${Math.round((Date.now() - started) / 1000)}s`);
}

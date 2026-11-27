import { test, expect } from '../fixtures';
import { up as up007 } from '../../../server/src/db/migrations/007-denormalize-workspaceId';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { up as up014 } from '../../../server/src/db/migrations/014-workspace-is-personal';

test.describe('migration 007 quoting', () => {
  /**
   * R3.3 — migration 007 must emit MySQL-safe SQL (backtick identifiers, no
   * double-quoted identifiers). No MySQL server is needed: the migration is run
   * against a fake QueryInterface that quotes like the mysql dialect and records
   * every raw SQL statement it issues.
   */
  test('[R3.3] migration 007 emits no double-quoted identifiers under the mysql dialect', async () => {
    const sql: string[] = [];
    const qi: any = {
      quoteIdentifier: (name: string) => '`' + name + '`', // mysql dialect quoting
      addColumn: async () => {},
      sequelize: { query: async (s: string) => { sql.push(s); return [[], 0]; } },
    };

    await up007({ context: qi });

    expect(sql.length).toBeGreaterThanOrEqual(2);
    for (const s of sql) {
      expect(s, `MySQL rejects double-quoted identifiers: ${s}`).not.toContain('"');
      expect(s).toContain('`workspaceId`');
      expect(s).toContain('`collectionId`');
    }
  });
});

test.describe('migration 004 and chain', () => {
  /**
   * R3.3b — remaining migrations (004) must emit MySQL-safe SQL: identifiers are
   * quoted via queryInterface.quoteIdentifier, never hard-coded double quotes.
   * Also verifies the real migration chain still works on SQLite.
   */
  process.env.CERT_ENCRYPTION_KEY = process.env.CERT_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const SERVER_DIR = path.join(__dirname, '..', '..', '..', 'server');
  const TS_NODE = path.join(SERVER_DIR, 'node_modules', 'ts-node', 'dist', 'bin.js');

  test('[R3.3b] migrations emit no double-quoted identifiers under the mysql dialect', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { up } = require('../../../server/src/db/migrations/004-seal-client-certificates');
    const sql: string[] = [];
    const qi: any = {
      quoteIdentifier: (name: string) => '`' + name + '`',
      sequelize: {
        query: async (s: string) => {
          sql.push(s);
          if (/^SELECT/i.test(s)) return [[{ id: 'u1', clientCertificates: JSON.stringify([{ key: 'plain-key', passphrase: 'pw' }]) }], 1];
          return [[], 0];
        },
      },
    };
    await up({ context: qi });

    expect(sql.length).toBe(2);
    for (const s of sql) {
      expect(s, `MySQL rejects double-quoted identifiers: ${s}`).not.toContain('"');
      expect(s).toContain('`clientCertificates`');
    }
  });

  test('[R3.3b] real migration chain still succeeds on sqlite', async () => {
    test.setTimeout(240_000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqspace-r33b-'));
    const dbPath = path.join(dir, 'data.sqlite');
    try {
      const r = await new Promise<{ code: number | null; out: string }>((resolve) => {
        const child = spawn(process.execPath, [TS_NODE, '--transpile-only', 'src/db/migrate.ts'], {
          cwd: SERVER_DIR,
          env: {
            ...process.env,
            DB_CONNECTION_STRING: '',
            DB_STORAGE_PATH: dbPath,
            NODE_ENV: 'test',
            CERT_ENCRYPTION_KEY: process.env.CERT_ENCRYPTION_KEY!,
          },
        });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        const t = setTimeout(() => child.kill(), 200_000);
        child.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
      });
      expect(r.out).not.toMatch(/SQLITE_ERROR|Migration failed/i);
      expect(r.code, r.out).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('migration 014 quoting', () => {
  /**
   * R3.3c — migration 014 must emit MySQL-safe SQL (backtick identifiers, no
   * double-quoted identifiers). Run against a fake QueryInterface that quotes
   * like the mysql dialect and records every raw SQL statement it issues.
   */
  test('[R3.3c] migration 014 emits no double-quoted identifiers under the mysql dialect', async () => {
    const sql: string[] = [];
    const qi: any = {
      quoteIdentifier: (name: string) => '`' + name + '`', // mysql dialect quoting
      addColumn: async () => {},
      bulkUpdate: async () => {},
      sequelize: { query: async (s: string) => { sql.push(s); return []; } },
    };

    await up014({ context: qi });

    expect(sql.length).toBeGreaterThanOrEqual(1);
    for (const s of sql) {
      expect(s, `MySQL rejects double-quoted identifiers: ${s}`).not.toContain('"');
      expect(s).toContain('`isPersonal`');
    }
  });
});

test.describe('concurrent migrations', () => {
  /**
   * [R3.7] Two server processes starting at once on the same fresh SQLite DB
   * must not collide on schema sync / migrations. Uses the migration entrypoint
   * (same connectDb path as the server boot) against a temp DB — never touches
   * the 3105 test server or its database.
   */

  const SERVER_DIR = path.join(__dirname, '..', '..', '..', 'server');
  const TS_NODE = path.join(SERVER_DIR, 'node_modules', 'ts-node', 'dist', 'bin.js');

  function runMigrate(dbPath: string): Promise<{ code: number | null; out: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [TS_NODE, '--transpile-only', 'src/db/migrate.ts'], {
        cwd: SERVER_DIR,
        env: {
          ...process.env,
          DB_CONNECTION_STRING: '',
          DB_STORAGE_PATH: dbPath,
          NODE_ENV: 'test',
          CERT_ENCRYPTION_KEY: process.env.CERT_ENCRYPTION_KEY || 'r37-test-key-r37-test-key-r37-test-key',
        },
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      const timer = setTimeout(() => child.kill(), 150_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, out });
      });
    });
  }

  test.describe('R3.7 concurrent migrations', () => {
    test.setTimeout(480_000);

    test('[R3.7] two processes migrating the same SQLite DB concurrently both succeed', async () => {
      for (let round = 0; round < 3; round++) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqspace-r37-'));
        const dbPath = path.join(dir, 'data.sqlite');
        try {
          const results = await Promise.all([runMigrate(dbPath), runMigrate(dbPath), runMigrate(dbPath)]);
          for (const r of results) {
            expect(r.out, `round ${round}`).not.toMatch(/SQLITE_ERROR|Migration failed/i);
            expect(r.code, r.out).toBe(0);
          }
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    });
  });
});

test.describe('bundle size', () => {
  /**
   * R6.6 (finding 192): the production bundle shipped Monaco inside the entry chunk
   * (4.8MB entry, 14.4MB total JS). The initial load (scripts + modulepreloads
   * referenced by index.html) must stay within a budget; Monaco is lazy-loaded.
   */
  const ROOT = path.join(__dirname, '..', '..', '..');
  const INITIAL_JS_BUDGET = 2 * 1024 * 1024; // 2MB uncompressed

  test('[R6.6] initial JS (entry + preloads) stays under budget; Monaco is code-split', async () => {
    test.setTimeout(600_000);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'reqspace-r66-'));
    try {
      execSync(`npx vite build --outDir "${out}" --emptyOutDir`, {
        cwd: path.join(ROOT, 'client'),
        stdio: 'pipe',
        timeout: 540_000,
      });
      const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
      const refs = new Set<string>();
      for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\.js)"/g)) refs.add(m[1]);
      expect(refs.size).toBeGreaterThan(0);
      let total = 0;
      for (const r of refs) total += fs.statSync(path.join(out, r)).size;
      expect(total, `initial JS ${(total / 1048576).toFixed(2)}MB`).toBeLessThan(INITIAL_JS_BUDGET);
      // Monaco must live in a separate, non-initial chunk.
      const assets = fs.readdirSync(path.join(out, 'assets'));
      expect(assets.some((f) => /^monacoEditorImpl-.*\.js$/.test(f))).toBe(true);
      for (const r of refs) expect(path.basename(r)).not.toMatch(/monaco|editor\.api/);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

test.describe('server and build source checks', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  test('[R3.7] concurrent servers on one DB are protected by a migration lock', async () => {
    expect(src('server/src/db/connect.ts')).toContain('reqspace_migration_lock');
  });

  test('[R6.6] Monaco is loaded lazily, not statically imported by the entry bundle', async () => {
    const lazy = src('client/src/components/common/LazyEditor.tsx');
    expect(lazy).toMatch(/lazy\(|import\(/);
    expect(lazy).toContain('monacoEditorImpl');
    expect(lazy).not.toMatch(/^import .* from ['"]\.\/monacoEditorImpl['"]/m);
    expect(lazy).not.toMatch(/^import (?!type).* from ['"]@monaco-editor\/react['"]/m);
  });
});

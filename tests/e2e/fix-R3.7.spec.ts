import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * [R3.7] Two server processes starting at once on the same fresh SQLite DB
 * must not collide on schema sync / migrations. Uses the migration entrypoint
 * (same connectDb path as the server boot) against a temp DB — never touches
 * the 3105 test server or its database.
 */

const SERVER_DIR = path.join(__dirname, '..', '..', 'server');
const TS_NODE = path.join(SERVER_DIR, 'node_modules', 'ts-node', 'dist', 'bin.js');

function runMigrate(dbPath: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TS_NODE, '--transpile-only', 'src/db/migrate.ts'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        DB_TYPE: 'sqlite',
        DB_STORAGE_PATH: dbPath,
        DB_CONFIG_FILE: path.join(path.dirname(dbPath), 'no-such-config.json'),
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

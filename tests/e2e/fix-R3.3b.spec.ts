import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * R3.3b — remaining migrations (004) must emit MySQL-safe SQL: identifiers are
 * quoted via queryInterface.quoteIdentifier, never hard-coded double quotes.
 * Also verifies the real migration chain still works on SQLite.
 */
process.env.CERT_ENCRYPTION_KEY = process.env.CERT_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const SERVER_DIR = path.join(__dirname, '..', '..', 'server');
const TS_NODE = path.join(SERVER_DIR, 'node_modules', 'ts-node', 'dist', 'bin.js');

test('[R3.3b] migrations emit no double-quoted identifiers under the mysql dialect', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { up } = require('../../server/src/db/migrations/004-seal-client-certificates');
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
          DB_TYPE: 'sqlite',
          DB_STORAGE_PATH: dbPath,
          DB_CONFIG_FILE: path.join(dir, 'no-such-config.json'),
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

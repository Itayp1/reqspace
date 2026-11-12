import { test, expect } from '@playwright/test';
import { up } from '../../server/src/db/migrations/007-denormalize-workspaceId';

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

  await up({ context: qi });

  expect(sql.length).toBeGreaterThanOrEqual(2);
  for (const s of sql) {
    expect(s, `MySQL rejects double-quoted identifiers: ${s}`).not.toContain('"');
    expect(s).toContain('`workspaceId`');
    expect(s).toContain('`collectionId`');
  }
});

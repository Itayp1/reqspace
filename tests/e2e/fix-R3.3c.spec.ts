import { test, expect } from '@playwright/test';
import { up } from '../../server/src/db/migrations/014-workspace-is-personal';

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

  await up({ context: qi });

  expect(sql.length).toBeGreaterThanOrEqual(1);
  for (const s of sql) {
    expect(s, `MySQL rejects double-quoted identifiers: ${s}`).not.toContain('"');
    expect(s).toContain('`isPersonal`');
  }
});

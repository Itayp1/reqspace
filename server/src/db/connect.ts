
import path from 'path';
import type { Sequelize } from 'sequelize';
import { Umzug, SequelizeStorage } from 'umzug';
import { DbConfig } from './dbConfig';
import { initSequelize } from './sequelize';
import { initSqlModels } from './sql-models';

const LOCK_TABLE = 'reqspace_migration_lock';
const LOCK_STALE_MS = 5 * 60 * 1000;
const LOCK_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * Serializes schema sync + migrations across processes (PM2 cluster, k8s
 * replicas) with a row in a tiny lock table — portable across SQLite,
 * Postgres and MySQL. A lock older than LOCK_STALE_MS (crashed holder) is
 * taken over.
 */
async function withMigrationLock<T>(sq: Sequelize, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let acquired = false;
  let lastErr: unknown;
  while (!acquired) {
    try {
      await sq.query(`CREATE TABLE IF NOT EXISTS ${LOCK_TABLE} (id INTEGER PRIMARY KEY, locked_at BIGINT NOT NULL)`);
    } catch {
      // concurrent CREATE of the same table; the insert below decides
    }
    try {
      await sq.query(`DELETE FROM ${LOCK_TABLE} WHERE id = 1 AND locked_at < :stale`, { replacements: { stale: Date.now() - LOCK_STALE_MS } });
      await sq.query(`INSERT INTO ${LOCK_TABLE} (id, locked_at) VALUES (1, :now)`, { replacements: { now: Date.now() } });
      acquired = true;
    } catch (err) {
      lastErr = err;
      if (Date.now() > deadline) throw lastErr;
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
    }
  }
  try {
    return await fn();
  } finally {
    await sq.query(`DELETE FROM ${LOCK_TABLE} WHERE id = 1`).catch(() => {});
  }
}

export async function connectDb(config: DbConfig): Promise<void> {

  // SQL path
  const sq = initSequelize(config);
  initSqlModels();

  await sq.authenticate();
  console.log(`✅ ${config.type.toUpperCase()} connected`);

  await withMigrationLock(sq, async () => {
    // `alter: true` diffs and mutates the live schema on every boot — a standing
    // data-loss risk in production (CR#18). Only auto-alter outside production;
    // in production just create missing tables non-destructively. Real schema
    // changes (an index/column added to a table that already exists) go
    // through the migrations below instead.
    await sq.sync(process.env.NODE_ENV === 'production' ? {} : { alter: true });
    console.log('✅ SQL tables synced');

    // Runs after sync(), not before: a brand-new table is created above already
    // carrying every index from its model definition, so migrations only need
    // to backfill indexes on databases that predate this migration — they
    // never hit addIndex against a table that doesn't exist yet.
    const migrationExt = __filename.endsWith('.ts') ? 'ts' : 'js';
    const umzug = new Umzug({
      migrations: { glob: path.join(__dirname, 'migrations', `*.${migrationExt}`).replace(/\\/g, '/') },
      context: sq.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize: sq }),
      logger: console,
    });
    await umzug.up(); // fail fast — do not swallow
  });
  console.log('✅ DB migrations up to date');
}

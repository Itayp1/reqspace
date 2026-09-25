
import path from 'path';
import { Umzug, SequelizeStorage } from 'umzug';
import { DbConfig } from './dbConfig';
import { initSequelize } from './sequelize';
import { initSqlModels } from './sql-models';

export async function connectDb(config: DbConfig): Promise<void> {

  // SQL path
  const sq = initSequelize(config);
  initSqlModels();

  await sq.authenticate();
  console.log(`✅ ${config.type.toUpperCase()} connected`);

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
  console.log('✅ DB migrations up to date');
}

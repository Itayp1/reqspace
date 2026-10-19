import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Collections and folders get their own `auth`, so a request set to
 * `inherit` has something to inherit.
 *
 * Until this column existed, only `requests` carried auth. `resolveInheritedAuth`
 * walks the folder chain and then the collection looking for the nearest
 * ancestor whose auth isn't itself `inherit` — with nowhere to store one, that
 * walk always came up empty and `inherit` silently behaved like `none`.
 */
// A folder defaults to `inherit`, i.e. pass-through: an untouched folder must
// not shadow its collection's auth. `none` is reserved for the user actively
// choosing "No Auth", which does block the parent. A collection is the top of
// the chain, so it has nothing to inherit and defaults to `none`.
const TABLES = [
  { table: 'collections', default: '{"type":"none"}' },
  { table: 'folders', default: '{"type":"inherit"}' },
] as const;

export async function up({ context: qi }: { context: QueryInterface }) {
  for (const { table, default: defaultValue } of TABLES) {
    try {
      await qi.addColumn(table, 'auth', {
        type: DataTypes.TEXT,
        defaultValue,
        allowNull: true,
      });
      console.log(`  + added ${table}.auth`);
    } catch (e: any) {
      // Re-running against a database that already has it is not a failure.
      if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
    }
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  for (const { table } of TABLES) {
    await qi.removeColumn(table, 'auth');
  }
}

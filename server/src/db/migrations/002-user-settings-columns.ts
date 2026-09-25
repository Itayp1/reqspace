import { QueryInterface, DataTypes } from 'sequelize';

// 2e2b5f0 replaced the old `preferences` column with `settings` +
// `clientCertificates` (a different shape, not a rename — there's nothing
// sensible to carry over). Like the indexes in 001, sq.sync({}) in
// production never adds a column to a table that already exists (CR#18),
// so any database created before that commit is stuck querying a `users`
// table missing both columns — which throws `column "settings" does not
// exist` on every query that touches SqlUser. Backfill them with the same
// empty defaults new rows get.
export async function up({ context: qi }: { context: QueryInterface }) {
  const table = await qi.describeTable('users');
  if (!table.settings) {
    await qi.addColumn('users', 'settings', { type: DataTypes.TEXT, defaultValue: '{}' });
  }
  if (!table.clientCertificates) {
    await qi.addColumn('users', 'clientCertificates', { type: DataTypes.TEXT, defaultValue: '[]' });
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.removeColumn('users', 'clientCertificates'); } catch { /* best-effort */ }
  try { await qi.removeColumn('users', 'settings'); } catch { /* best-effort */ }
}

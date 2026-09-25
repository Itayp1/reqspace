import { QueryInterface, DataTypes } from 'sequelize';

// `shortId` and `workspaceId` were added to the SqlSharedLink model after
// some databases already had a `shared_links` table. `sq.sync({})` in
// production only creates missing tables, never adds a column to one that
// already exists (CR#18), so those databases are stuck without them —
// exactly the bug FIX-3 (001-indexes) backfills for indexes. Columns are
// added nullable, not unique, at the DB level: an existing table may already
// hold rows with no value for either field, and a NOT NULL/UNIQUE
// constraint would fail the migration on those. The model still declares
// them required for every new row the app writes.
export async function up({ context: qi }: { context: QueryInterface }) {
  const addColumn = async (table: string, column: string, type: any) => {
    try {
      await qi.addColumn(table, column, { type, allowNull: true });
    } catch (e: any) {
      if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
    }
  };
  await addColumn('shared_links', 'shortId', DataTypes.STRING(20));
  await addColumn('shared_links', 'workspaceId', DataTypes.STRING(36));

  try {
    await qi.addIndex('shared_links', ['shortId'], { name: 'idx_shared_links_shortid', unique: true });
  } catch (e: any) {
    if (!/already exists|duplicate/i.test(e?.message ?? '')) throw e;
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.removeIndex('shared_links', 'idx_shared_links_shortid'); } catch {}
  try { await qi.removeColumn('shared_links', 'workspaceId'); } catch {}
  try { await qi.removeColumn('shared_links', 'shortId'); } catch {}
}

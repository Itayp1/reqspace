import { QueryInterface, DataTypes } from 'sequelize';

// Surfaces sync failures that were previously only visible in server logs
// (doSyncForksOfCollection's catch block just did console.error). Fork owners
// had no way to tell a sync had started silently failing — lastSyncAt simply
// stopped advancing, with nothing in the UI to explain why.
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addColumn('collection_forks', 'lastSyncError', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    console.log('  + added collection_forks.lastSyncError');
  } catch (e: any) {
    if (!/duplicate column|already exists/i.test(e?.message ?? '')) throw e;
    console.log('  ~ collection_forks.lastSyncError already exists, skipping');
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.removeColumn('collection_forks', 'lastSyncError'); } catch (e) {}
}

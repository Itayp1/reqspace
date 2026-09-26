import { QueryInterface, DataTypes } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  // collection_forks — tracks which collection is a fork of which source
  try {
    await qi.createTable('collection_forks', {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      sourceCollectionId: { type: DataTypes.STRING(36), allowNull: false },
      forkedCollectionId: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      forkedByUserId: { type: DataTypes.STRING(36), allowNull: false },
      forkedAt: { type: DataTypes.DATE, allowNull: false },
      lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    });
    console.log('  + created collection_forks');
  } catch (e: any) {
    if (!/already exists/i.test(e?.message ?? '')) throw e;
    console.log('  ~ collection_forks already exists, skipping');
  }

  // fork_item_hashes — per-item MD5 hash at time of fork (base hash)
  // Used to detect whether the fork owner has modified an item since forking.
  try {
    await qi.createTable('fork_item_hashes', {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      forkId: { type: DataTypes.STRING(36), allowNull: false },
      itemType: { type: DataTypes.STRING(20), allowNull: false },
      itemId: { type: DataTypes.STRING(36), allowNull: false },
      sourceItemId: { type: DataTypes.STRING(36), allowNull: false },
      baseHash: { type: DataTypes.STRING(32), allowNull: false },
    });
    await qi.addIndex('fork_item_hashes', ['forkId'], { name: 'idx_fork_item_hashes_forkId' });
    await qi.addIndex('fork_item_hashes', ['itemId'], { name: 'idx_fork_item_hashes_itemId' });
    console.log('  + created fork_item_hashes');
  } catch (e: any) {
    if (!/already exists|Duplicate key name/i.test(e?.message ?? '')) throw e;
    console.log('  ~ fork_item_hashes already exists, skipping');
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.dropTable('fork_item_hashes'); } catch (e) {}
  try { await qi.dropTable('collection_forks'); } catch (e) {}
}

import { QueryInterface } from 'sequelize';

// Defense-in-depth against the fork-sync race (CR: concurrent upstream saves
// could both see an item as "missing in fork" and both insert it). The
// in-process lock in syncForksOfCollection() is the primary fix; this unique
// constraint is the DB-level backstop in case of multiple app instances.
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addIndex('fork_item_hashes', ['forkId', 'sourceItemId'], {
      name: 'uniq_fork_item_hashes_fork_source',
      unique: true,
    });
    console.log('  + added unique index uniq_fork_item_hashes_fork_source');
  } catch (e: any) {
    if (!/already exists|Duplicate key name|duplicate/i.test(e?.message ?? '')) throw e;
    console.log('  ~ uniq_fork_item_hashes_fork_source already exists, skipping');
  }

  // collection_forks was created (migration 010) without the indexes its model
  // declares. In dev, sq.sync({ alter: true }) backfills that on every boot,
  // but production only runs sq.sync({}) (non-destructive: create-if-missing),
  // which never adds indexes to a table that already exists — so on a
  // production DB the lookup in syncForksOfCollection() (`where
  // sourceCollectionId`) was doing a full table scan. Backfill both here.
  try {
    await qi.addIndex('collection_forks', ['sourceCollectionId'], {
      name: 'idx_collection_forks_sourceCollectionId',
    });
    console.log('  + added index idx_collection_forks_sourceCollectionId');
  } catch (e: any) {
    if (!/already exists|Duplicate key name|duplicate/i.test(e?.message ?? '')) throw e;
    console.log('  ~ idx_collection_forks_sourceCollectionId already exists, skipping');
  }
  try {
    await qi.addIndex('collection_forks', ['forkedCollectionId'], {
      name: 'uniq_collection_forks_forkedCollectionId',
      unique: true,
    });
    console.log('  + added unique index uniq_collection_forks_forkedCollectionId');
  } catch (e: any) {
    if (!/already exists|Duplicate key name|duplicate/i.test(e?.message ?? '')) throw e;
    console.log('  ~ uniq_collection_forks_forkedCollectionId already exists, skipping');
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.removeIndex('fork_item_hashes', 'uniq_fork_item_hashes_fork_source'); } catch (e) {}
  try { await qi.removeIndex('collection_forks', 'idx_collection_forks_sourceCollectionId'); } catch (e) {}
  try { await qi.removeIndex('collection_forks', 'uniq_collection_forks_forkedCollectionId'); } catch (e) {}
}

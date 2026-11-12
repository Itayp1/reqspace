import { QueryInterface } from 'sequelize';

// `sq.sync({})` (production) only creates missing tables — it never adds an
// index to a table that already exists (CR#18). Every index below was added
// to the model definitions in `sql-models/index.ts` after some databases
// were already created, so those databases are missing them. This migration
// backfills them. Safe to re-run: duplicate/already-exists errors are
// swallowed, anything else is rethrown.
const INDEXES: Array<{ table: string; fields: string[]; name: string }> = [
  { table: 'workspaces', fields: ['ownerId'], name: 'idx_workspaces_owner' },
  { table: 'collections', fields: ['workspaceId'], name: 'idx_collections_workspace' },
  { table: 'collections', fields: ['workspaceId', 'order'], name: 'idx_collections_workspace_order' },
  { table: 'folders', fields: ['collectionId'], name: 'idx_folders_collection' },
  { table: 'folders', fields: ['collectionId', 'parentFolderId'], name: 'idx_folders_collection_parent' },
  { table: 'requests', fields: ['collectionId'], name: 'idx_requests_collection' },
  { table: 'requests', fields: ['folderId'], name: 'idx_requests_folder' },
  { table: 'requests', fields: ['collectionId', 'folderId', 'order'], name: 'idx_requests_collection_folder_order' },
  { table: 'environments', fields: ['workspaceId'], name: 'idx_environments_workspace' },
  { table: 'history', fields: ['userId', 'workspaceId'], name: 'idx_history_user_workspace' },
  { table: 'history', fields: ['createdAt'], name: 'idx_history_created' },
  { table: 'audit_logs', fields: ['userId'], name: 'idx_audit_user' },
  { table: 'audit_logs', fields: ['targetId'], name: 'idx_audit_target' },
];

export async function up({ context: qi }: { context: QueryInterface }) {
  for (const { table, fields, name } of INDEXES) {
    try {
      await qi.addIndex(table, fields, { name });
    } catch (e: any) {
      if (!/already exists|duplicate/i.test(e?.message ?? '')) throw e;
    }
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  for (const { table, name } of INDEXES) {
    try {
      await qi.removeIndex(table, name);
    } catch {
      // index may already be gone — down() is best-effort
    }
  }
}

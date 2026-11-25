import { QueryInterface } from 'sequelize';

// History pruning (per-user / per-workspace caps, retention) sums and orders by createdAt for one user:
// these composite indexes serve those queries without sorting every row of the user.
const INDEXES = [
  { fields: ['userId', 'workspaceId', 'createdAt'], name: 'idx_history_user_ws_created' },
  { fields: ['userId', 'createdAt'], name: 'idx_history_user_created' },
];

export async function up({ context: qi }: { context: QueryInterface }) {
  for (const { fields, name } of INDEXES) {
    try {
      await qi.addIndex('history', fields, { name });
    } catch (e: any) {
      if (!/already exists|duplicate/i.test(e?.message ?? '')) throw e;
    }
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  for (const { name } of INDEXES) {
    try { await qi.removeIndex('history', name); } catch { /* best effort */ }
  }
}

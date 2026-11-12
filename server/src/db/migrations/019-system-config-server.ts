import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Adds `server` (TEXT, JSON) to `system_config`: the admin-editable runtime
 * settings that used to come from environment variables (cookie security,
 * rate limits, error de-duplication, OAuth redirect allowlist). A NULL value
 * means "all defaults".
 */
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addColumn('system_config', 'server', { type: DataTypes.TEXT, allowNull: true });
    console.log('  + added system_config.server');
  } catch (e: any) {
    // Idempotent — the column may already exist (fresh sync, or a re-run).
    if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('system_config', 'server');
}

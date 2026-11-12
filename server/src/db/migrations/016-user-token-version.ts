import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Adds `tokenVersion` (INTEGER, default 0) to the `users` table.
 *
 * Used to invalidate JWT sessions server-side: the token carries the version
 * at the time it was issued; the authenticate middleware compares it to the
 * stored value and rejects the request with 401 if they differ (A4.2 / A5.8).
 *
 * Incrementing the field on logout or password-change immediately revokes all
 * previously issued tokens without requiring a token block-list.
 */
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addColumn('users', 'tokenVersion', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    console.log('  + added users.tokenVersion');
  } catch (e: any) {
    // Idempotent — re-running against a DB that already has the column is fine.
    if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('users', 'tokenVersion');
}

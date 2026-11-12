import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Adds `repeats` (INTEGER, default 0) to `fperrors`: occurrences swallowed by
 * the dedupe window are tallied on the stored row so the group count stays
 * accurate (Q7.4).
 */
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addColumn('fperrors', 'repeats', { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false });
    console.log('  + added fperrors.repeats');
  } catch (e: any) {
    if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('fperrors', 'repeats');
}

import { QueryInterface, DataTypes } from 'sequelize';

/** Adds nullable `requests.updatedBy` (user id of the last content editor) for the save-conflict dialog. */
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addColumn('requests', 'updatedBy', { type: DataTypes.STRING(36), allowNull: true });
  } catch (e: any) {
    if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('requests', 'updatedBy');
}

import { QueryInterface, DataTypes } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addColumn('collections', 'roles', {
      type: DataTypes.TEXT,
      defaultValue: '[]',
      allowNull: true
    });
    console.log(`  + backfilled collections.roles`);
  } catch (e: any) {
    if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('collections', 'roles');
}

import { QueryInterface, DataTypes } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  // user_profile_variables — cross-workspace personal variables tied to a user.
  // Unlike local_variables (per workspace+user), these are pure per-user and
  // available in every workspace the user belongs to.
  try {
    await qi.createTable('user_profile_variables', {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      userId: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      variables: { type: DataTypes.TEXT, defaultValue: '[]' },
      updatedAt: { type: DataTypes.DATE, allowNull: true },
    });
    console.log('  + created user_profile_variables');
  } catch (e: any) {
    if (!/already exists/i.test(e?.message ?? '')) throw e;
    console.log('  ~ user_profile_variables already exists, skipping');
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.dropTable('user_profile_variables'); } catch (e) {}
}

import { QueryInterface, DataTypes } from 'sequelize';

// Invite links (/invite/<token>). Only the sha256 of the token is stored.
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.createTable('workspace_invite_links', {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      workspaceId: { type: DataTypes.STRING(36), allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      role: { type: DataTypes.STRING(20), allowNull: false },
      singleUse: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      useCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      createdBy: { type: DataTypes.STRING(36), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    });
    await qi.addIndex('workspace_invite_links', ['workspaceId']);
    console.log('  + created workspace_invite_links');
  } catch (e: any) {
    if (!/already exists/i.test(e?.message ?? '')) throw e;
    console.log('  ~ workspace_invite_links already exists, skipping');
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.dropTable('workspace_invite_links'); } catch (e) {}
}

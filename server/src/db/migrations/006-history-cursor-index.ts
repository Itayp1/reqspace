import { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  try {
    await queryInterface.addIndex('histories', ['userId', 'workspaceId', 'createdAt'], {
      name: 'idx_histories_user_workspace_createdAt',
    });
  } catch (e) {
    // ignore if already exists
  }
}

export async function down(queryInterface: QueryInterface) {
  try {
    await queryInterface.removeIndex('histories', 'idx_histories_user_workspace_createdAt');
  } catch (e) {
    // ignore if missing
  }
}

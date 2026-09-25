import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  try {
    await queryInterface.addColumn('folders', 'workspaceId', {
      type: DataTypes.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn('requests', 'workspaceId', {
      type: DataTypes.UUID,
      allowNull: true,
    });

    // Populate existing workspaceIds
    await queryInterface.sequelize.query(`
      UPDATE folders SET workspaceId = (SELECT workspaceId FROM collections WHERE collections.id = folders.collectionId)
    `);
    await queryInterface.sequelize.query(`
      UPDATE requests SET workspaceId = (SELECT workspaceId FROM collections WHERE collections.id = requests.collectionId)
    `);

    // Make them non-null
    await queryInterface.changeColumn('folders', 'workspaceId', {
      type: DataTypes.UUID,
      allowNull: false,
    });
    await queryInterface.changeColumn('requests', 'workspaceId', {
      type: DataTypes.UUID,
      allowNull: false,
    });

  } catch (e) {
    // ignore if already exists
  }
}

export async function down(queryInterface: QueryInterface) {
  try {
    await queryInterface.removeColumn('folders', 'workspaceId');
    await queryInterface.removeColumn('requests', 'workspaceId');
  } catch (e) {
    // ignore
  }
}

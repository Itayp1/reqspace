import { QueryInterface, DataTypes } from 'sequelize';

async function addColumnIfMissing(qi: QueryInterface, table: string, column: string) {
  try {
    await qi.addColumn(table, column, { type: DataTypes.UUID, allowNull: true });
  } catch (e: any) {
    if (!/duplicate column|already exists/i.test(e?.message ?? '')) throw e;
  }
}

export async function up(queryInterface: QueryInterface) {
  await addColumnIfMissing(queryInterface, 'folders', 'workspaceId');
  await addColumnIfMissing(queryInterface, 'requests', 'workspaceId');

  // Populate existing workspaceIds
  await queryInterface.sequelize.query(`
    UPDATE folders SET "workspaceId" = (SELECT "workspaceId" FROM collections WHERE collections.id = folders."collectionId")
  `);
  await queryInterface.sequelize.query(`
    UPDATE requests SET "workspaceId" = (SELECT "workspaceId" FROM collections WHERE collections.id = requests."collectionId")
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
}

export async function down(queryInterface: QueryInterface) {
  try {
    await queryInterface.removeColumn('folders', 'workspaceId');
    await queryInterface.removeColumn('requests', 'workspaceId');
  } catch (e) {
    // ignore
  }
}

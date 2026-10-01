import { QueryInterface, DataTypes } from 'sequelize';

async function addColumnIfMissing(qi: QueryInterface, table: string, column: string) {
  try {
    await qi.addColumn(table, column, { type: DataTypes.UUID, allowNull: true });
  } catch (e: any) {
    if (!/duplicate column|already exists/i.test(e?.message ?? '')) throw e;
  }
}

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  await addColumnIfMissing(queryInterface, 'folders', 'workspaceId');
  await addColumnIfMissing(queryInterface, 'requests', 'workspaceId');

  // Populate existing workspaceIds
  await queryInterface.sequelize.query(`
    UPDATE folders SET "workspaceId" = (SELECT "workspaceId" FROM collections WHERE collections.id = folders."collectionId")
  `);
  await queryInterface.sequelize.query(`
    UPDATE requests SET "workspaceId" = (SELECT "workspaceId" FROM collections WHERE collections.id = requests."collectionId")
  `);

  // Deliberately left nullable. SqlFolder/SqlRequest don't declare a
  // workspaceId attribute and no write path populates it, so NOT NULL would
  // reject every folder/request insert. (Until the error handling here was
  // fixed, this whole migration failed silently and the columns never existed.)
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  try {
    await queryInterface.removeColumn('folders', 'workspaceId');
    await queryInterface.removeColumn('requests', 'workspaceId');
  } catch (e) {
    // ignore
  }
}

// Wipes the E2E database before the Playwright webServer (and its bootstrap
// seeding of the superadmin) starts. This must run as a separate step BEFORE
// `playwright test`, not as Playwright's own globalSetup — Playwright starts
// webServer before running globalSetup, so a wipe done there truncates the
// admin user the server just seeded, leaving tests unable to log in.
const { createConnection } = require('mysql2/promise');

async function wipeMysql() {
  console.log('Wiping MySQL database for E2E tests...');
  let connection;
  try {
    connection = await createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: Number(process.env.DB_PORT) || 3306,
    });

    const dbName = process.env.DB_NAME || 'reqspace_test';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.query(`USE \`${dbName}\`;`);

    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    const [rows] = await connection.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ?;`,
      [dbName]
    );
    const tables = rows.map((row) => row.TABLE_NAME || row.table_name);
    for (const table of tables) {
      await connection.query(`TRUNCATE TABLE \`${table}\`;`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('Database wiped successfully.');
  } catch (error) {
    console.error('Failed to wipe database:', error);
    // Ignore error if the DB doesn't exist yet — it will be created by Sequelize.
  } finally {
    if (connection) await connection.end();
  }
}

async function main() {
  const dbType = process.env.DB_TYPE || 'sqlite';
  if (dbType === 'sqlite') {
    // Playwright's webServer runs the server with DB_STORAGE_PATH=':memory:',
    // so every fresh process already starts from a blank DB. Nothing to wipe.
    return;
  }
  if (dbType === 'postgres') {
    // No wipe script yet — CI gives postgres a fresh service container per
    // run, so this only matters for a long-lived local postgres instance.
    return;
  }
  if (dbType === 'mysql') {
    await wipeMysql();
  }
}

main().catch((err) => {
  console.error('wipe-db failed:', err);
  process.exit(1);
});

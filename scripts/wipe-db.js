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
    const url = new URL(process.env.DB_CONNECTION_STRING || 'mysql://root@localhost:3306/reqspace_test');
    connection = await createConnection({
      host: url.hostname,
      user: decodeURIComponent(url.username || 'root'),
      password: decodeURIComponent(url.password),
      port: Number(url.port) || 3306,
    });

    const dbName = decodeURIComponent(url.pathname.slice(1)) || 'reqspace_test';
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
  // Only MySQL has a wipe. SQLite starts from a blank file per run, and postgres
  // gets a fresh service container per CI run.
  if ((process.env.DB_CONNECTION_STRING || '').startsWith('mysql://')) {
    await wipeMysql();
  }
}

main().catch((err) => {
  console.error('wipe-db failed:', err);
  process.exit(1);
});

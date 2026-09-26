import { FullConfig } from '@playwright/test';
import { createConnection } from 'mysql2/promise';

const SERVER_URL = 'http://localhost:3005';
// Password the seeded admin/admin superadmin ends up with once globalSetup
// walks it through the forced first-login change. Every spec that logs in
// as the seeded admin must use this, not the original 'admin' — see the
// forcedAdminPasswordChange() call at the bottom of this file for why.
export const ADMIN_PASSWORD = 'admin123456';

// Resets the seeded superadmin and walks it through the forced first-login
// password change exactly once, before any test file runs. Without this,
// whichever spec file happens to run first (admin.spec.ts, alphabetically)
// performs that change live as a side effect of its own assertions, and
// every other spec that logs in as admin/admin for the rest of the run —
// collection.spec.ts, environments.spec.ts, requests.spec.ts — gets a wrong
// password and fails on an assertion that has nothing to do with what it's
// actually testing.
async function forcedAdminPasswordChange() {
  const loginRes = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: 'admin' }),
  });
  if (!loginRes.ok) return; // no seeded admin, or the password was already changed
  const cookie = loginRes.headers.get('set-cookie');
  const { user } = await loginRes.json() as { user?: { mustChangePassword?: boolean } };
  if (!user?.mustChangePassword || !cookie) return;

  await fetch(`${SERVER_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ newPassword: ADMIN_PASSWORD }),
  });
}

async function globalSetup(config: FullConfig) {
  await forcedAdminPasswordChange();

  if (process.env.DB_TYPE === 'sqlite') {
    return;
  }

  if (process.env.DB_TYPE === 'postgres') {
    return; // we don't have a postgres wipe script yet
  }

  console.log('🔄 Wiping MySQL Database for E2E tests...');
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

    // Disable foreign key checks to truncate tables
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    const [rows] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ?;
    `, [dbName]);

    const tables = (rows as any[]).map(row => row.TABLE_NAME || row.table_name);

    for (const table of tables) {
      await connection.query(`TRUNCATE TABLE \`${table}\`;`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('✅ Database wiped successfully.');
  } catch (error) {
    console.error('❌ Failed to wipe database:', error);
    // Ignore error if DB doesn't exist yet, it will be created by Sequelize
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

export default globalSetup;

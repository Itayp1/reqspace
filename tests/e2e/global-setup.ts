import { FullConfig } from '@playwright/test';
import { createConnection } from 'mysql2/promise';

async function globalSetup(config: FullConfig) {
  console.log('🔄 Wiping MySQL Database for E2E tests...');
  
  let connection = await createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 3306,
  });

  const dbName = process.env.DB_NAME || 'reqspace_test';
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
  await connection.query(`USE \`${dbName}\`;`);

  try {
    // Disable foreign key checks to truncate tables
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    const [rows] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ?;
    `, [process.env.DB_NAME || 'reqspace_test']);

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
    await connection.end();
  }
}

export default globalSetup;

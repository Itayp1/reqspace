#!/usr/bin/env ts-node
/**
 * Manual DB Connection Tester
 * Usage: npx ts-node src/tests/db.connection.manual.ts
 *
 * Tests connection and basic table creation against any configured DB.
 * Set env vars before running, e.g.:
 *
 *   DB_TYPE=mysql DB_HOST=localhost DB_PORT=3306 DB_NAME=postman_clone DB_USER=root DB_PASSWORD=secret
 *   DB_TYPE=postgres DB_HOST=localhost DB_PORT=5432 DB_NAME=postman_clone DB_USER=postgres DB_PASSWORD=pass
 *   DB_TYPE=mssql DB_HOST=localhost DB_PORT=1433 DB_NAME=postman_clone DB_USER=sa DB_PASSWORD=Pass1234!
 *   DB_TYPE=mongodb MONGO_URI=mongodb://localhost:27017/postman_clone
 *   DB_TYPE=sqlite DB_STORAGE_PATH=./test.sqlite
 *   DB_CONNECTION_STRING=postgres://user:pass@host:5432/db  (with DB_TYPE=postgres)
 */

import dotenv from 'dotenv';
dotenv.config();

import { getDbConfig } from '../db/dbConfig';
import { connectDb } from '../db/connect';
import { v4 as uuidv4 } from 'uuid';

type TestResult = { name: string; passed: boolean; error?: string };
const results: TestResult[] = [];

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  ✅ ${name}`);
}
function fail(name: string, err: any) {
  results.push({ name, passed: false, error: err?.message || String(err) });
  console.error(`  ❌ ${name}: ${err?.message || err}`);
}

async function run() {
  const cfg = getDbConfig();
  console.log(`\n🗄️  Testing DB connection: ${cfg.type.toUpperCase()}`);
  if (cfg.host) console.log(`   Host: ${cfg.host}:${cfg.port} / DB: ${cfg.database}`);
  if (cfg.connectionString) console.log(`   Connection String: ${cfg.connectionString.replace(/\/\/.*@/, '//***@')}`);
  if (cfg.storagePath) console.log(`   SQLite file: ${cfg.storagePath}`);
  console.log('');

  // ── 1. Connect ──────────────────────────────────────────────────────────
  console.log('1. Testing connection...');
  try {
    await connectDb(cfg);
    pass('Database connection established');
  } catch (err) {
    fail('Database connection', err);
    printSummary();
    process.exit(1);
  }

  // ── 2. SQL-specific tests ────────────────────────────────────────────────
  if (cfg.type !== 'mongodb') {
    const { getSequelize } = await import('../db/sequelize');
    const { initSqlModels, SqlUser, SqlWorkspace, SqlCollection, SqlRequest, SqlEnvironment } = await import('../db/sql-models');

    initSqlModels();
    const sq = getSequelize();

    console.log('\n2. Testing table creation (sync)...');
    try {
      await sq.sync({ alter: false });
      pass('Tables created/verified');
    } catch (err) {
      fail('Table sync', err);
    }

    console.log('\n3. Testing CRUD operations...');

    // Users
    let testUserId: string | null = null;
    try {
      const id = uuidv4();
      await SqlUser.create({
        id, name: 'Test User', email: `test-${id.slice(0,8)}@example.com`,
        passwordHash: null, authType: 'password', isSuperAdmin: false,
        status: 'active', settings: '{}', clientCertificates: '[]', historyUsedBytes: 0, mustChangePassword: false,
      });
      const found = await SqlUser.findByPk(id);
      if (!found || found.name !== 'Test User') throw new Error('User read-back failed');
      testUserId = id;
      pass('User create + read');
    } catch (err) { fail('User CRUD', err); }

    // Workspaces
    let testWsId: string | null = null;
    try {
      const id = uuidv4();
      const ownerId = testUserId || uuidv4();
      await SqlWorkspace.create({
        id, name: 'Test Workspace', description: '', ownerId,
        members: JSON.stringify([{ userId: ownerId, role: 'owner', joinedAt: new Date() }]),
        isPublic: false,
      });
      const found = await SqlWorkspace.findByPk(id);
      if (!found) throw new Error('Workspace read-back failed');
      testWsId = id;
      pass('Workspace create + read');
    } catch (err) { fail('Workspace CRUD', err); }

    // Collections
    let testColId: string | null = null;
    try {
      const id = uuidv4();
      await SqlCollection.create({
        id, workspaceId: testWsId || uuidv4(), name: 'Test Collection',
        description: '', variables: '[]', preRequestScript: '', testScript: '',
        order: 0, createdBy: testUserId || uuidv4(),
      });
      const found = await SqlCollection.findByPk(id);
      if (!found) throw new Error('Collection read-back failed');
      testColId = id;
      pass('Collection create + read');
    } catch (err) { fail('Collection CRUD', err); }

    // Requests
    try {
      const id = uuidv4();
      const auth = { type: 'bearer', bearer: { token: 'tok' } };
      await SqlRequest.create({
        id, collectionId: testColId || uuidv4(), folderId: null,
        name: 'Test Request', method: 'GET', url: 'https://httpbin.org/get',
        params: '[]', headers: '[]', auth: JSON.stringify(auth), body: '{"mode":"none"}',
        preRequestScript: '', testScript: '', description: '', order: 0,
        comments: '[]', createdBy: testUserId || uuidv4(),
      });
      const found = await SqlRequest.findByPk(id);
      const parsedAuth = JSON.parse(found!.auth);
      if (parsedAuth.type !== 'bearer') throw new Error('JSON round-trip failed');
      pass('Request create + JSON round-trip');
    } catch (err) { fail('Request CRUD', err); }

    // Environments
    try {
      const id = uuidv4();
      const vars = [{ key: 'BASE_URL', value: 'https://api.test.com', enabled: true }];
      await SqlEnvironment.create({
        id, workspaceId: testWsId || uuidv4(), name: 'Test Env',
        variables: JSON.stringify(vars), createdBy: testUserId || uuidv4(),
      });
      const found = await SqlEnvironment.findByPk(id);
      const parsedVars = JSON.parse(found!.variables);
      if (parsedVars[0].key !== 'BASE_URL') throw new Error('Variables JSON round-trip failed');
      pass('Environment create + JSON round-trip');
    } catch (err) { fail('Environment CRUD', err); }

    // Cleanup
    console.log('\n4. Cleaning up test data...');
    try {
      if (testUserId) await SqlUser.destroy({ where: { id: testUserId } });
      if (testWsId) await SqlWorkspace.destroy({ where: { id: testWsId } });
      if (testColId) await SqlCollection.destroy({ where: { id: testColId } });
      pass('Test data cleaned up');
    } catch (err) { fail('Cleanup', err); }

  } else {
    // MongoDB-specific
    console.log('\n2. Testing MongoDB operations...');
    const mongoose = await import('mongoose');
    try {
      const state = mongoose.default.connection.readyState;
      if (state !== 1) throw new Error(`Connection state is ${state}, expected 1 (connected)`);
      pass('MongoDB readyState = 1 (connected)');
    } catch (err) { fail('MongoDB connection state', err); }

    try {
      const colNames = (await mongoose.default.connection.db!.listCollections().toArray()).map(c => c.name);
      pass(`Collections accessible: [${colNames.slice(0,5).join(', ')}...]`);
    } catch (err) { fail('MongoDB list collections', err); }
  }

  printSummary();
  process.exit(results.some(r => !r.passed) ? 1 : 0);
}

function printSummary() {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => console.log(`  ❌ ${r.name}: ${r.error}`));
  } else {
    console.log('🎉 All tests passed!');
  }
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

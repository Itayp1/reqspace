#!/usr/bin/env ts-node
"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dbConfig_1 = require("../db/dbConfig");
const connect_1 = require("../db/connect");
const uuid_1 = require("uuid");
const results = [];
function pass(name) {
    results.push({ name, passed: true });
    console.log(`  ✅ ${name}`);
}
function fail(name, err) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  ❌ ${name}: ${err?.message || err}`);
}
async function run() {
    const cfg = (0, dbConfig_1.getDbConfig)();
    console.log(`\n🗄️  Testing DB connection: ${cfg.type.toUpperCase()}`);
    if (cfg.host)
        console.log(`   Host: ${cfg.host}:${cfg.port} / DB: ${cfg.database}`);
    if (cfg.connectionString)
        console.log(`   Connection String: ${cfg.connectionString.replace(/\/\/.*@/, '//***@')}`);
    if (cfg.storagePath)
        console.log(`   SQLite file: ${cfg.storagePath}`);
    console.log('');
    // ── 1. Connect ──────────────────────────────────────────────────────────
    console.log('1. Testing connection...');
    try {
        await (0, connect_1.connectDb)(cfg);
        pass('Database connection established');
    }
    catch (err) {
        fail('Database connection', err);
        printSummary();
        process.exit(1);
    }
    // ── 2. SQL-specific tests ────────────────────────────────────────────────
    if (cfg.type !== 'mongodb') {
        const { getSequelize } = await Promise.resolve().then(() => __importStar(require('../db/sequelize')));
        const { initSqlModels, SqlUser, SqlWorkspace, SqlCollection, SqlRequest, SqlEnvironment } = await Promise.resolve().then(() => __importStar(require('../db/sql-models')));
        initSqlModels();
        const sq = getSequelize();
        console.log('\n2. Testing table creation (sync)...');
        try {
            await sq.sync({ alter: false });
            pass('Tables created/verified');
        }
        catch (err) {
            fail('Table sync', err);
        }
        console.log('\n3. Testing CRUD operations...');
        // Users
        let testUserId = null;
        try {
            const id = (0, uuid_1.v4)();
            await SqlUser.create({
                id, name: 'Test User', email: `test-${id.slice(0, 8)}@example.com`,
                passwordHash: null, authType: 'password', isSuperAdmin: false,
                status: 'active', preferences: '{}', historyUsedBytes: 0, mustChangePassword: false,
            });
            const found = await SqlUser.findByPk(id);
            if (!found || found.name !== 'Test User')
                throw new Error('User read-back failed');
            testUserId = id;
            pass('User create + read');
        }
        catch (err) {
            fail('User CRUD', err);
        }
        // Workspaces
        let testWsId = null;
        try {
            const id = (0, uuid_1.v4)();
            const ownerId = testUserId || (0, uuid_1.v4)();
            await SqlWorkspace.create({
                id, name: 'Test Workspace', description: '', ownerId,
                members: JSON.stringify([{ userId: ownerId, role: 'owner', joinedAt: new Date() }]),
                isPublic: false,
            });
            const found = await SqlWorkspace.findByPk(id);
            if (!found)
                throw new Error('Workspace read-back failed');
            testWsId = id;
            pass('Workspace create + read');
        }
        catch (err) {
            fail('Workspace CRUD', err);
        }
        // Collections
        let testColId = null;
        try {
            const id = (0, uuid_1.v4)();
            await SqlCollection.create({
                id, workspaceId: testWsId || (0, uuid_1.v4)(), name: 'Test Collection',
                description: '', variables: '[]', preRequestScript: '', testScript: '',
                order: 0, createdBy: testUserId || (0, uuid_1.v4)(),
            });
            const found = await SqlCollection.findByPk(id);
            if (!found)
                throw new Error('Collection read-back failed');
            testColId = id;
            pass('Collection create + read');
        }
        catch (err) {
            fail('Collection CRUD', err);
        }
        // Requests
        try {
            const id = (0, uuid_1.v4)();
            const auth = { type: 'bearer', bearer: { token: 'tok' } };
            await SqlRequest.create({
                id, collectionId: testColId || (0, uuid_1.v4)(), folderId: null,
                name: 'Test Request', method: 'GET', url: 'https://httpbin.org/get',
                params: '[]', headers: '[]', auth: JSON.stringify(auth), body: '{"mode":"none"}',
                preRequestScript: '', testScript: '', description: '', order: 0,
                comments: '[]', createdBy: testUserId || (0, uuid_1.v4)(),
            });
            const found = await SqlRequest.findByPk(id);
            const parsedAuth = JSON.parse(found.auth);
            if (parsedAuth.type !== 'bearer')
                throw new Error('JSON round-trip failed');
            pass('Request create + JSON round-trip');
        }
        catch (err) {
            fail('Request CRUD', err);
        }
        // Environments
        try {
            const id = (0, uuid_1.v4)();
            const vars = [{ key: 'BASE_URL', value: 'https://api.test.com', enabled: true }];
            await SqlEnvironment.create({
                id, workspaceId: testWsId || (0, uuid_1.v4)(), name: 'Test Env',
                variables: JSON.stringify(vars), createdBy: testUserId || (0, uuid_1.v4)(),
            });
            const found = await SqlEnvironment.findByPk(id);
            const parsedVars = JSON.parse(found.variables);
            if (parsedVars[0].key !== 'BASE_URL')
                throw new Error('Variables JSON round-trip failed');
            pass('Environment create + JSON round-trip');
        }
        catch (err) {
            fail('Environment CRUD', err);
        }
        // Cleanup
        console.log('\n4. Cleaning up test data...');
        try {
            if (testUserId)
                await SqlUser.destroy({ where: { id: testUserId } });
            if (testWsId)
                await SqlWorkspace.destroy({ where: { id: testWsId } });
            if (testColId)
                await SqlCollection.destroy({ where: { id: testColId } });
            pass('Test data cleaned up');
        }
        catch (err) {
            fail('Cleanup', err);
        }
    }
    else {
        // MongoDB-specific
        console.log('\n2. Testing MongoDB operations...');
        const mongoose = await Promise.resolve().then(() => __importStar(require('mongoose')));
        try {
            const state = mongoose.default.connection.readyState;
            if (state !== 1)
                throw new Error(`Connection state is ${state}, expected 1 (connected)`);
            pass('MongoDB readyState = 1 (connected)');
        }
        catch (err) {
            fail('MongoDB connection state', err);
        }
        try {
            const colNames = (await mongoose.default.connection.db.listCollections().toArray()).map(c => c.name);
            pass(`Collections accessible: [${colNames.slice(0, 5).join(', ')}...]`);
        }
        catch (err) {
            fail('MongoDB list collections', err);
        }
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
    }
    else {
        console.log('🎉 All tests passed!');
    }
}
run().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
//# sourceMappingURL=db.connection.manual.js.map
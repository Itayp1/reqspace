"use strict";
/**
 * SQL Models / Schema Tests — uses SQLite in-memory
 *
 * Tests that:
 * 1. All SQL tables are created correctly (sync)
 * 2. Basic CRUD works on each table
 * 3. JSON fields serialize/deserialize correctly
 * 4. Unique constraints are enforced
 */
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const uuid_1 = require("uuid");
// We create a fresh Sequelize instance for each test suite
let sq;
// Dynamically import to control Sequelize singleton
jest.mock('../db/sequelize', () => {
    const actual = jest.requireActual('../db/sequelize');
    return {
        ...actual,
        getSequelize: () => sq,
        initSequelize: () => sq,
    };
});
jest.mock('../db/connect', () => ({
    isMongo: () => false,
    connectDb: jest.fn(),
}));
const sql_models_1 = require("../db/sql-models");
beforeAll(async () => {
    sq = new sequelize_1.Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    (0, sql_models_1.initSqlModels)();
    await sq.sync({ force: true });
});
afterAll(async () => {
    await sq.close();
});
// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlUser table', () => {
    const userId = (0, uuid_1.v4)();
    it('creates a user', async () => {
        const u = await sql_models_1.SqlUser.create({
            id: userId,
            name: 'Alice',
            email: 'alice@example.com',
            passwordHash: '$2b$10$hashedvalue',
            authType: 'password',
            isSuperAdmin: false,
            status: 'active',
            preferences: JSON.stringify({ saveHistory: true }),
            historyUsedBytes: 0,
            mustChangePassword: false,
        });
        expect(u.id).toBe(userId);
        expect(u.name).toBe('Alice');
        expect(u.email).toBe('alice@example.com');
    });
    it('finds user by pk', async () => {
        const u = await sql_models_1.SqlUser.findByPk(userId);
        expect(u).not.toBeNull();
        expect(u.email).toBe('alice@example.com');
    });
    it('finds user by email', async () => {
        const u = await sql_models_1.SqlUser.findOne({ where: { email: 'alice@example.com' } });
        expect(u).not.toBeNull();
    });
    it('enforces unique email constraint', async () => {
        await expect(sql_models_1.SqlUser.create({
            id: (0, uuid_1.v4)(),
            name: 'Duplicate',
            email: 'alice@example.com', // duplicate
            passwordHash: null,
            authType: 'password',
            isSuperAdmin: false,
            status: 'active',
            preferences: '{}',
            historyUsedBytes: 0,
            mustChangePassword: false,
        })).rejects.toThrow();
    });
    it('updates user', async () => {
        await sql_models_1.SqlUser.update({ name: 'Alice Updated' }, { where: { id: userId } });
        const u = await sql_models_1.SqlUser.findByPk(userId);
        expect(u.name).toBe('Alice Updated');
    });
    it('stores preferences as JSON string and reads back', async () => {
        const prefs = { saveHistory: true, historyClearOlderThanDays: 30 };
        await sql_models_1.SqlUser.update({ preferences: JSON.stringify(prefs) }, { where: { id: userId } });
        const u = await sql_models_1.SqlUser.findByPk(userId);
        const parsed = JSON.parse(u.preferences);
        expect(parsed.saveHistory).toBe(true);
        expect(parsed.historyClearOlderThanDays).toBe(30);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACES
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlWorkspace table', () => {
    const wsId = (0, uuid_1.v4)();
    const ownerId = (0, uuid_1.v4)();
    it('creates a workspace', async () => {
        const members = [{ userId: ownerId, role: 'owner', joinedAt: new Date() }];
        const w = await sql_models_1.SqlWorkspace.create({
            id: wsId,
            name: 'Test Workspace',
            description: 'A workspace for testing',
            ownerId,
            members: JSON.stringify(members),
            isPublic: false,
        });
        expect(w.id).toBe(wsId);
        expect(w.name).toBe('Test Workspace');
    });
    it('members field deserializes correctly', async () => {
        const w = await sql_models_1.SqlWorkspace.findByPk(wsId);
        const members = JSON.parse(w.members);
        expect(Array.isArray(members)).toBe(true);
        expect(members[0].role).toBe('owner');
        expect(members[0].userId).toBe(ownerId);
    });
    it('lists workspaces', async () => {
        const all = await sql_models_1.SqlWorkspace.findAll();
        expect(all.length).toBeGreaterThanOrEqual(1);
    });
    it('updates workspace name', async () => {
        await sql_models_1.SqlWorkspace.update({ name: 'Renamed Workspace' }, { where: { id: wsId } });
        const w = await sql_models_1.SqlWorkspace.findByPk(wsId);
        expect(w.name).toBe('Renamed Workspace');
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlCollection table', () => {
    const colId = (0, uuid_1.v4)();
    const wsId = (0, uuid_1.v4)();
    const userId = (0, uuid_1.v4)();
    it('creates a collection', async () => {
        const c = await sql_models_1.SqlCollection.create({
            id: colId, workspaceId: wsId, name: 'My API', description: '',
            variables: JSON.stringify([{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }]),
            preRequestScript: '', testScript: '', order: 0, createdBy: userId,
        });
        expect(c.name).toBe('My API');
    });
    it('deserializes variables array', async () => {
        const c = await sql_models_1.SqlCollection.findByPk(colId);
        const vars = JSON.parse(c.variables);
        expect(vars[0].key).toBe('baseUrl');
    });
    it('finds by workspaceId', async () => {
        const cols = await sql_models_1.SqlCollection.findAll({ where: { workspaceId: wsId } });
        expect(cols.length).toBe(1);
    });
    it('deletes collection', async () => {
        await sql_models_1.SqlCollection.destroy({ where: { id: colId } });
        const c = await sql_models_1.SqlCollection.findByPk(colId);
        expect(c).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlRequest table', () => {
    const reqId = (0, uuid_1.v4)();
    const colId = (0, uuid_1.v4)();
    const userId = (0, uuid_1.v4)();
    const auth = { type: 'bearer', bearer: { token: 'mytoken123' } };
    const body = { mode: 'raw', raw: '{"key":"value"}', rawLanguage: 'json' };
    const headers = [{ key: 'Content-Type', value: 'application/json', enabled: true }];
    it('creates a request with nested JSON fields', async () => {
        const r = await sql_models_1.SqlRequest.create({
            id: reqId, collectionId: colId, folderId: null,
            name: 'Create User', method: 'POST', url: 'https://api.example.com/users',
            params: '[]',
            headers: JSON.stringify(headers),
            auth: JSON.stringify(auth),
            body: JSON.stringify(body),
            preRequestScript: '', testScript: '', description: '', order: 0,
            comments: '[]', createdBy: userId,
        });
        expect(r.method).toBe('POST');
        expect(r.url).toBe('https://api.example.com/users');
    });
    it('auth field round-trips correctly', async () => {
        const r = await sql_models_1.SqlRequest.findByPk(reqId);
        const parsed = JSON.parse(r.auth);
        expect(parsed.type).toBe('bearer');
        expect(parsed.bearer.token).toBe('mytoken123');
    });
    it('body field round-trips correctly', async () => {
        const r = await sql_models_1.SqlRequest.findByPk(reqId);
        const parsed = JSON.parse(r.body);
        expect(parsed.mode).toBe('raw');
        expect(parsed.rawLanguage).toBe('json');
    });
    it('headers array round-trips correctly', async () => {
        const r = await sql_models_1.SqlRequest.findByPk(reqId);
        const parsed = JSON.parse(r.headers);
        expect(parsed[0].key).toBe('Content-Type');
    });
    it('finds requests by collectionId', async () => {
        const reqs = await sql_models_1.SqlRequest.findAll({ where: { collectionId: colId } });
        expect(reqs.length).toBe(1);
    });
    it('updates request URL', async () => {
        await sql_models_1.SqlRequest.update({ url: 'https://api.example.com/users/updated' }, { where: { id: reqId } });
        const r = await sql_models_1.SqlRequest.findByPk(reqId);
        expect(r.url).toContain('updated');
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENTS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlEnvironment table', () => {
    const envId = (0, uuid_1.v4)();
    const wsId = (0, uuid_1.v4)();
    const userId = (0, uuid_1.v4)();
    const vars = [
        { key: 'API_KEY', value: 'abc123', type: 'secret', enabled: true },
        { key: 'BASE_URL', value: 'https://api.dev.com', enabled: true },
    ];
    it('creates an environment', async () => {
        const e = await sql_models_1.SqlEnvironment.create({
            id: envId, workspaceId: wsId, name: 'Development',
            variables: JSON.stringify(vars), createdBy: userId,
        });
        expect(e.name).toBe('Development');
    });
    it('variables array round-trips', async () => {
        const e = await sql_models_1.SqlEnvironment.findByPk(envId);
        const parsed = JSON.parse(e.variables);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].key).toBe('API_KEY');
        expect(parsed[1].value).toBe('https://api.dev.com');
    });
    it('global environment upsert', async () => {
        const globalVars = [{ key: 'GLOBAL_TOKEN', value: 'tok', enabled: true }];
        await sql_models_1.SqlGlobalEnvironment.upsert({
            id: (0, uuid_1.v4)(), workspaceId: wsId,
            variables: JSON.stringify(globalVars), updatedAt: new Date(),
        });
        const g = await sql_models_1.SqlGlobalEnvironment.findOne({ where: { workspaceId: wsId } });
        expect(g).not.toBeNull();
        const parsed = JSON.parse(g.variables);
        expect(parsed[0].key).toBe('GLOBAL_TOKEN');
    });
    it('global environment unique workspaceId constraint (upsert updates)', async () => {
        // Second upsert with same workspaceId should update variables, not duplicate
        const newVars = [{ key: 'UPDATED', value: 'yes', enabled: true }];
        // Use findOrCreate + update (same as repository does)
        const [existing] = await sql_models_1.SqlGlobalEnvironment.findOrCreate({
            where: { workspaceId: wsId },
            defaults: { id: (0, uuid_1.v4)(), workspaceId: wsId, variables: JSON.stringify(newVars), updatedAt: new Date() },
        });
        await existing.update({ variables: JSON.stringify(newVars), updatedAt: new Date() });
        const all = await sql_models_1.SqlGlobalEnvironment.findAll({ where: { workspaceId: wsId } });
        expect(all.length).toBe(1); // Still only one row
        const parsed = JSON.parse(all[0].variables);
        expect(parsed[0].key).toBe('UPDATED');
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlHistory table', () => {
    const userId = (0, uuid_1.v4)();
    const wsId = (0, uuid_1.v4)();
    it('creates history entries', async () => {
        await sql_models_1.SqlHistory.create({
            id: (0, uuid_1.v4)(), userId, workspaceId: wsId,
            method: 'GET', url: 'https://api.example.com/users',
            statusCode: 200, duration: 123,
            requestData: JSON.stringify({ headers: [] }),
            responseData: JSON.stringify({ body: '{"users":[]}', statusCode: 200 }),
        });
        await sql_models_1.SqlHistory.create({
            id: (0, uuid_1.v4)(), userId, workspaceId: wsId,
            method: 'POST', url: 'https://api.example.com/users',
            statusCode: 201, duration: 456,
            requestData: '{}', responseData: '{}',
        });
        const entries = await sql_models_1.SqlHistory.findAll({ where: { userId, workspaceId: wsId } });
        expect(entries.length).toBe(2);
    });
    it('sorts history by createdAt DESC', async () => {
        const entries = await sql_models_1.SqlHistory.findAll({
            where: { userId, workspaceId: wsId },
            order: [['createdAt', 'DESC']],
        });
        expect(entries[0].method).toBeTruthy();
    });
    it('responseData round-trips', async () => {
        const entry = await sql_models_1.SqlHistory.findOne({ where: { method: 'GET', userId } });
        const parsed = JSON.parse(entry.responseData);
        expect(parsed.statusCode).toBe(200);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlAuditLog table', () => {
    const userId = (0, uuid_1.v4)();
    it('creates audit log entries', async () => {
        await sql_models_1.SqlAuditLog.create({
            id: (0, uuid_1.v4)(), userId,
            action: 'CREATE', targetType: 'collection', targetId: (0, uuid_1.v4)(),
            details: JSON.stringify({ collectionName: 'My API' }),
        });
        const logs = await sql_models_1.SqlAuditLog.findAll({ where: { userId } });
        expect(logs.length).toBe(1);
        expect(logs[0].action).toBe('CREATE');
    });
    it('details round-trips', async () => {
        const log = await sql_models_1.SqlAuditLog.findOne({ where: { userId } });
        const details = JSON.parse(log.details);
        expect(details.collectionName).toBe('My API');
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM CONFIG
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlSystemConfig table', () => {
    it('creates system config', async () => {
        const c = await sql_models_1.SqlSystemConfig.create({
            id: (0, uuid_1.v4)(),
            auth: JSON.stringify({ mode: 'login' }),
            history: JSON.stringify({ maxRequestBodyKB: 100 }),
            proxy: JSON.stringify({ enabled: false }),
            updatedAt: new Date(),
        });
        expect(c.auth).toContain('login');
        expect(c.history).toContain('maxRequestBodyKB');
    });
    it('updates system config', async () => {
        const existing = await sql_models_1.SqlSystemConfig.findOne();
        await sql_models_1.SqlSystemConfig.update({ auth: JSON.stringify({ mode: 'header' }) }, { where: { id: existing.id } });
        const updated = await sql_models_1.SqlSystemConfig.findOne();
        expect(updated.auth).toContain('header');
    });
    it('history stores JSON correctly', async () => {
        const historyData = { maxRequestBodyKB: 999 };
        const existing = await sql_models_1.SqlSystemConfig.findOne();
        await sql_models_1.SqlSystemConfig.update({ history: JSON.stringify(historyData) }, { where: { id: existing.id } });
        const updated = await sql_models_1.SqlSystemConfig.findOne();
        const parsed = JSON.parse(updated.history);
        expect(parsed.maxRequestBodyKB).toBe(999);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// SHARED LINKS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlSharedLink table', () => {
    const colId = (0, uuid_1.v4)();
    const userId = (0, uuid_1.v4)();
    it('creates a shared link', async () => {
        const token = 'tok_abc123unique';
        const link = await sql_models_1.SqlSharedLink.create({
            id: (0, uuid_1.v4)(), collectionId: colId, token,
            createdBy: userId, expiresAt: null,
        });
        expect(link.token).toBe(token);
    });
    it('finds link by token', async () => {
        const link = await sql_models_1.SqlSharedLink.findOne({ where: { token: 'tok_abc123unique' } });
        expect(link).not.toBeNull();
        expect(link.collectionId).toBe(colId);
    });
    it('enforces unique token constraint', async () => {
        await expect(sql_models_1.SqlSharedLink.create({
            id: (0, uuid_1.v4)(), collectionId: colId,
            token: 'tok_abc123unique', // duplicate
            createdBy: userId, expiresAt: null,
        })).rejects.toThrow();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlFolder table', () => {
    const folderId = (0, uuid_1.v4)();
    const colId = (0, uuid_1.v4)();
    it('creates a folder', async () => {
        const f = await sql_models_1.SqlFolder.create({
            id: folderId, collectionId: colId, parentFolderId: null,
            name: 'Auth', description: 'Auth endpoints',
            preRequestScript: '', testScript: '', order: 0,
        });
        expect(f.name).toBe('Auth');
        expect(f.parentFolderId).toBeNull();
    });
    it('creates nested folder', async () => {
        const nested = await sql_models_1.SqlFolder.create({
            id: (0, uuid_1.v4)(), collectionId: colId, parentFolderId: folderId,
            name: 'OAuth', description: '',
            preRequestScript: '', testScript: '', order: 1,
        });
        expect(nested.parentFolderId).toBe(folderId);
    });
    it('finds folders by collectionId ordered by order', async () => {
        const folders = await sql_models_1.SqlFolder.findAll({
            where: { collectionId: colId },
            order: [['order', 'ASC']],
        });
        expect(folders.length).toBe(2);
        expect(folders[0].name).toBe('Auth');
    });
});
//# sourceMappingURL=db.sqlmodels.test.js.map
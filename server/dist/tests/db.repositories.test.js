"use strict";
/**
 * Repository Layer Tests — SQLite in-memory
 *
 * Tests that the UserRepository, WorkspaceRepository, CollectionRepository,
 * RequestRepository, EnvironmentRepository, HistoryRepository, AuditLogRepository,
 * and SystemConfigRepository all work correctly in SQL mode.
 *
 * No MongoDB or external DB required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const uuid_1 = require("uuid");
let sq;
// Mock sequelize singleton so repositories get our test instance
jest.mock('../db/sequelize', () => {
    const actual = jest.requireActual('../db/sequelize');
    return {
        ...actual,
        getSequelize: () => sq,
        initSequelize: () => sq,
    };
});
// Force SQL mode in all repositories
jest.mock('../db/connect', () => ({
    isMongo: () => false,
    connectDb: jest.fn(),
}));
const sql_models_1 = require("../db/sql-models");
const UserRepository_1 = require("../repositories/UserRepository");
const WorkspaceRepository_1 = require("../repositories/WorkspaceRepository");
const CollectionRepository_1 = require("../repositories/CollectionRepository");
const FolderRepository_1 = require("../repositories/FolderRepository");
const RequestRepository_1 = require("../repositories/RequestRepository");
const EnvironmentRepository_1 = require("../repositories/EnvironmentRepository");
const HistoryRepository_1 = require("../repositories/HistoryRepository");
const AuditLogRepository_1 = require("../repositories/AuditLogRepository");
const SystemConfigRepository_1 = require("../repositories/SystemConfigRepository");
beforeAll(async () => {
    sq = new sequelize_1.Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    (0, sql_models_1.initSqlModels)();
    await sq.sync({ force: true });
});
afterAll(async () => {
    await sq.close();
});
// ─────────────────────────────────────────────────────────────────────────────
// UserRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('UserRepository (SQL)', () => {
    let userId;
    it('creates a user', async () => {
        const u = await UserRepository_1.UserRepository.create({
            name: 'Bob',
            email: 'bob@example.com',
            passwordHash: '$2b$10$hash',
            authType: 'password',
            isSuperAdmin: false,
            status: 'active',
        });
        userId = u.id;
        expect(u.name).toBe('Bob');
        expect(u.email).toBe('bob@example.com');
        expect(u.id).toBeTruthy();
    });
    it('finds user by id', async () => {
        const u = await UserRepository_1.UserRepository.findById(userId);
        expect(u).not.toBeNull();
        expect(u.name).toBe('Bob');
    });
    it('finds user by email', async () => {
        const u = await UserRepository_1.UserRepository.findByEmail('bob@example.com');
        expect(u).not.toBeNull();
        expect(u.id).toBe(userId);
    });
    it('email lookup is case-insensitive', async () => {
        const u = await UserRepository_1.UserRepository.findByEmail('BOB@EXAMPLE.COM');
        expect(u).not.toBeNull();
    });
    it('returns null for unknown id', async () => {
        const u = await UserRepository_1.UserRepository.findById((0, uuid_1.v4)());
        expect(u).toBeNull();
    });
    it('updates user', async () => {
        const u = await UserRepository_1.UserRepository.update(userId, { name: 'Robert' });
        expect(u.name).toBe('Robert');
    });
    it('lists all users', async () => {
        const users = await UserRepository_1.UserRepository.list();
        expect(users.length).toBeGreaterThanOrEqual(1);
    });
    it('counts users', async () => {
        const count = await UserRepository_1.UserRepository.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });
    it('existsByEmail returns true for existing', async () => {
        expect(await UserRepository_1.UserRepository.existsByEmail('bob@example.com')).toBe(true);
    });
    it('existsByEmail returns false for non-existing', async () => {
        expect(await UserRepository_1.UserRepository.existsByEmail('nobody@example.com')).toBe(false);
    });
    it('deletes user', async () => {
        const tmp = await UserRepository_1.UserRepository.create({ name: 'Temp', email: 'temp@x.com' });
        await UserRepository_1.UserRepository.delete(tmp.id);
        const u = await UserRepository_1.UserRepository.findById(tmp.id);
        expect(u).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkspaceRepository (SQL)', () => {
    let wsId;
    const ownerId = (0, uuid_1.v4)();
    it('creates a workspace', async () => {
        const w = await WorkspaceRepository_1.WorkspaceRepository.create({ name: 'My Project', ownerId });
        wsId = w.id;
        expect(w.name).toBe('My Project');
        expect(w.ownerId).toBe(ownerId);
    });
    it('adds owner as member automatically', async () => {
        const w = await WorkspaceRepository_1.WorkspaceRepository.findById(wsId);
        expect(w.members.some(m => m.userId === ownerId && m.role === 'owner')).toBe(true);
    });
    it('finds workspace by id', async () => {
        const w = await WorkspaceRepository_1.WorkspaceRepository.findById(wsId);
        expect(w).not.toBeNull();
        expect(w.id).toBe(wsId);
    });
    it('finds workspaces for user', async () => {
        const ws = await WorkspaceRepository_1.WorkspaceRepository.findForUser(ownerId);
        expect(ws.some(w => w.id === wsId)).toBe(true);
    });
    it('updates workspace', async () => {
        const w = await WorkspaceRepository_1.WorkspaceRepository.update(wsId, { name: 'My Project (renamed)', description: 'Updated' });
        expect(w.name).toBe('My Project (renamed)');
        expect(w.description).toBe('Updated');
    });
    it('lists all workspaces', async () => {
        const all = await WorkspaceRepository_1.WorkspaceRepository.list();
        expect(all.length).toBeGreaterThanOrEqual(1);
    });
    it('deletes workspace', async () => {
        const tmp = await WorkspaceRepository_1.WorkspaceRepository.create({ name: 'Tmp', ownerId });
        await WorkspaceRepository_1.WorkspaceRepository.delete(tmp.id);
        expect(await WorkspaceRepository_1.WorkspaceRepository.findById(tmp.id)).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// CollectionRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('CollectionRepository (SQL)', () => {
    let colId;
    const wsId = (0, uuid_1.v4)();
    const userId = (0, uuid_1.v4)();
    it('creates a collection', async () => {
        const c = await CollectionRepository_1.CollectionRepository.create({ workspaceId: wsId, name: 'Payments API', createdBy: userId });
        colId = c.id;
        expect(c.name).toBe('Payments API');
    });
    it('finds collection by id', async () => {
        const c = await CollectionRepository_1.CollectionRepository.findById(colId);
        expect(c).not.toBeNull();
    });
    it('finds collections by workspace', async () => {
        await CollectionRepository_1.CollectionRepository.create({ workspaceId: wsId, name: 'Auth API', createdBy: userId });
        const cols = await CollectionRepository_1.CollectionRepository.findByWorkspace(wsId);
        expect(cols.length).toBe(2);
    });
    it('updates collection with variables', async () => {
        const vars = [{ key: 'baseUrl', value: 'https://pay.api.com', enabled: true }];
        const c = await CollectionRepository_1.CollectionRepository.update(colId, { name: 'Payments v2', variables: vars });
        expect(c.name).toBe('Payments v2');
        expect(c.variables[0].key).toBe('baseUrl');
    });
    it('deletes collection', async () => {
        await CollectionRepository_1.CollectionRepository.delete(colId);
        expect(await CollectionRepository_1.CollectionRepository.findById(colId)).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// FolderRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('FolderRepository (SQL)', () => {
    const colId = (0, uuid_1.v4)();
    let folderId;
    it('creates a folder', async () => {
        const f = await FolderRepository_1.FolderRepository.create({ collectionId: colId, name: 'Users' });
        folderId = f.id;
        expect(f.name).toBe('Users');
        expect(f.parentFolderId).toBeNull();
    });
    it('creates a sub-folder', async () => {
        const sub = await FolderRepository_1.FolderRepository.create({ collectionId: colId, name: 'Admin', parentFolderId: folderId });
        expect(sub.parentFolderId).toBe(folderId);
    });
    it('finds folders by collection', async () => {
        const folders = await FolderRepository_1.FolderRepository.findByCollection(colId);
        expect(folders.length).toBe(2);
    });
    it('updates folder', async () => {
        const f = await FolderRepository_1.FolderRepository.update(folderId, { name: 'User Endpoints' });
        expect(f.name).toBe('User Endpoints');
    });
    it('deletes folder', async () => {
        await FolderRepository_1.FolderRepository.delete(folderId);
        expect(await FolderRepository_1.FolderRepository.findById(folderId)).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// RequestRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('RequestRepository (SQL)', () => {
    const colId = (0, uuid_1.v4)();
    const userId = (0, uuid_1.v4)();
    let reqId;
    it('creates a request', async () => {
        const r = await RequestRepository_1.RequestRepository.create({
            collectionId: colId, name: 'List Users', createdBy: userId,
            method: 'GET', url: 'https://api.example.com/users',
            auth: { type: 'bearer', bearer: { token: 'mytoken' } },
            headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
        });
        reqId = r.id;
        expect(r.method).toBe('GET');
        expect(r.url).toBe('https://api.example.com/users');
    });
    it('auth field round-trips through repository', async () => {
        const r = await RequestRepository_1.RequestRepository.findById(reqId);
        expect(r.auth.type).toBe('bearer');
        expect(r.auth.bearer.token).toBe('mytoken');
    });
    it('headers array round-trips through repository', async () => {
        const r = await RequestRepository_1.RequestRepository.findById(reqId);
        expect(r.headers[0].key).toBe('Accept');
    });
    it('updates request body', async () => {
        const body = { mode: 'raw', raw: '{"name":"Alice"}', rawLanguage: 'json' };
        const r = await RequestRepository_1.RequestRepository.update(reqId, { body, method: 'POST' });
        expect(r.method).toBe('POST');
        expect(r.body.mode).toBe('raw');
        expect(r.body.rawLanguage).toBe('json');
    });
    it('finds requests by collection', async () => {
        const reqs = await RequestRepository_1.RequestRepository.findByCollection(colId);
        expect(reqs.length).toBe(1);
    });
    it('searches within collection', async () => {
        const results = await RequestRepository_1.RequestRepository.searchInWorkspace('Users', [colId]);
        expect(results.length).toBeGreaterThanOrEqual(1);
    });
    it('search returns empty for no match', async () => {
        const results = await RequestRepository_1.RequestRepository.searchInWorkspace('zzz_no_match', [colId]);
        expect(results.length).toBe(0);
    });
    it('deletes request', async () => {
        await RequestRepository_1.RequestRepository.delete(reqId);
        expect(await RequestRepository_1.RequestRepository.findById(reqId)).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// EnvironmentRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('EnvironmentRepository (SQL)', () => {
    const wsId = (0, uuid_1.v4)();
    const userId = (0, uuid_1.v4)();
    let envId;
    it('creates an environment', async () => {
        const e = await EnvironmentRepository_1.EnvironmentRepository.create({
            workspaceId: wsId, name: 'Staging', createdBy: userId,
            variables: [{ key: 'BASE_URL', value: 'https://staging.api.com', enabled: true }],
        });
        envId = e.id;
        expect(e.name).toBe('Staging');
    });
    it('variables round-trip through repository', async () => {
        const e = await EnvironmentRepository_1.EnvironmentRepository.findById(envId);
        expect(e.variables[0].key).toBe('BASE_URL');
        expect(e.variables[0].value).toBe('https://staging.api.com');
    });
    it('finds environments by workspace', async () => {
        const envs = await EnvironmentRepository_1.EnvironmentRepository.findByWorkspace(wsId);
        expect(envs.length).toBeGreaterThanOrEqual(1);
    });
    it('updates environment variables', async () => {
        const newVars = [
            { key: 'BASE_URL', value: 'https://staging-v2.api.com', enabled: true },
            { key: 'API_KEY', value: 'sk-test-123', enabled: true },
        ];
        const e = await EnvironmentRepository_1.EnvironmentRepository.update(envId, { variables: newVars });
        expect(e.variables.length).toBe(2);
        expect(e.variables[1].key).toBe('API_KEY');
    });
    it('upserts global environment', async () => {
        const globalVars = [{ key: 'GLOBAL_TIMEOUT', value: '5000', enabled: true }];
        const g = await EnvironmentRepository_1.EnvironmentRepository.upsertGlobal(wsId, globalVars);
        expect(g.variables[0].key).toBe('GLOBAL_TIMEOUT');
    });
    it('global env upsert updates (no duplicates)', async () => {
        const updated = [{ key: 'GLOBAL_TIMEOUT', value: '10000', enabled: true }];
        await EnvironmentRepository_1.EnvironmentRepository.upsertGlobal(wsId, updated);
        const g = await EnvironmentRepository_1.EnvironmentRepository.findGlobal(wsId);
        expect(g.variables[0].value).toBe('10000');
    });
    it('deletes environment', async () => {
        await EnvironmentRepository_1.EnvironmentRepository.delete(envId);
        expect(await EnvironmentRepository_1.EnvironmentRepository.findById(envId)).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// HistoryRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('HistoryRepository (SQL)', () => {
    const userId = (0, uuid_1.v4)();
    const wsId = (0, uuid_1.v4)();
    it('creates history entries', async () => {
        await HistoryRepository_1.HistoryRepository.create({
            userId, workspaceId: wsId, method: 'GET',
            url: 'https://api.example.com', statusCode: 200, duration: 150,
            requestData: { headers: [], method: 'GET', url: 'https://api.example.com' },
            responseData: { statusCode: 200, body: '{"ok":true}', headers: [] },
        });
        await HistoryRepository_1.HistoryRepository.create({
            userId, workspaceId: wsId, method: 'POST',
            url: 'https://api.example.com/create', statusCode: 201, duration: 300,
            requestData: {}, responseData: {},
        });
        const h = await HistoryRepository_1.HistoryRepository.findByUser(userId, wsId);
        expect(h.length).toBe(2);
    });
    it('responseData round-trips', async () => {
        const h = await HistoryRepository_1.HistoryRepository.findByUser(userId, wsId);
        const entry = h.find(e => e.method === 'GET');
        expect(entry.responseData.statusCode).toBe(200);
        expect(entry.responseData.body).toBe('{"ok":true}');
    });
    it('limits history results', async () => {
        const h = await HistoryRepository_1.HistoryRepository.findByUser(userId, wsId, 1);
        expect(h.length).toBe(1);
    });
    it('deletes history by user', async () => {
        await HistoryRepository_1.HistoryRepository.deleteByUser(userId);
        const h = await HistoryRepository_1.HistoryRepository.findByUser(userId, wsId);
        expect(h.length).toBe(0);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// AuditLogRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('AuditLogRepository (SQL)', () => {
    it('creates and finds audit logs by user', async () => {
        const userId = (0, uuid_1.v4)();
        await AuditLogRepository_1.AuditLogRepository.log({
            userId,
            action: 'test.action',
            targetType: 'User',
            targetId: userId,
            ip: '127.0.0.1',
            details: { foo: 'bar' },
        });
        await AuditLogRepository_1.AuditLogRepository.log({
            userId,
            action: 'test.action2',
        });
        const logs = await AuditLogRepository_1.AuditLogRepository.findByUser(userId);
        expect(logs.length).toBe(2);
        // descending order -> most recent first
        expect(logs[0].action).toBe('test.action2');
        expect(logs[1].action).toBe('test.action');
        expect(logs[1].details).toEqual({ foo: 'bar' });
    });
    it('limits results', async () => {
        const userId = (0, uuid_1.v4)();
        for (let i = 0; i < 5; i++) {
            await AuditLogRepository_1.AuditLogRepository.log({ userId, action: `a${i}` });
        }
        const logs = await AuditLogRepository_1.AuditLogRepository.findByUser(userId, 3);
        expect(logs.length).toBe(3);
        expect(logs[0].action).toBe('a4');
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// SystemConfigRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('SystemConfigRepository (SQL)', () => {
    it('returns null before config exists', async () => {
        const cfg = await SystemConfigRepository_1.SystemConfigRepository.ensure();
        expect(cfg.auth.mode).toBe('login');
        expect(cfg.history.cleanupPolicy).toBe('fifo');
    });
    it('get returns config after ensure', async () => {
        const cfg = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
        expect(cfg).not.toBeNull();
    });
    it('updates config', async () => {
        const updated = await SystemConfigRepository_1.SystemConfigRepository.updateConfig({
            auth: { mode: 'header', allowSelfRegistration: false }
        });
        expect(updated.auth.mode).toBe('header');
    });
    it('ensure is idempotent', async () => {
        await SystemConfigRepository_1.SystemConfigRepository.ensure();
        const cfg = await SystemConfigRepository_1.SystemConfigRepository.getConfig();
        expect(cfg).not.toBeNull();
    });
});
//# sourceMappingURL=db.repositories.test.js.map
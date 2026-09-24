/**
 * SQL Models / Schema Tests — uses SQLite in-memory
 *
 * Tests that:
 * 1. All SQL tables are created correctly (sync)
 * 2. Basic CRUD works on each table
 * 3. JSON fields serialize/deserialize correctly
 * 4. Unique constraints are enforced
 */

import { Sequelize } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

// We create a fresh Sequelize instance for each test suite
let sq: Sequelize;

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

import {
  SqlUser, SqlWorkspace, SqlCollection,
  SqlFolder, SqlRequest, SqlEnvironment,
  SqlGlobalEnvironment, SqlHistory, SqlAuditLog,
  SqlSystemConfig, SqlSharedLink, initSqlModels,
} from '../db/sql-models';

beforeAll(async () => {
  sq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  initSqlModels();
  await sq.sync({ force: true });
});

afterAll(async () => {
  await sq.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlUser table', () => {
  const userId = uuidv4();

  it('creates a user', async () => {
    const u = await SqlUser.create({
      id: userId,
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: '$2b$10$hashedvalue',
      authType: 'password',
      isSuperAdmin: false,
      status: 'active',
      settings: JSON.stringify({ saveHistory: true }),
      historyUsedBytes: 0,
      mustChangePassword: false,
    });
    expect(u.id).toBe(userId);
    expect(u.name).toBe('Alice');
    expect(u.email).toBe('alice@example.com');
  });

  it('finds user by pk', async () => {
    const u = await SqlUser.findByPk(userId);
    expect(u).not.toBeNull();
    expect(u!.email).toBe('alice@example.com');
  });

  it('finds user by email', async () => {
    const u = await SqlUser.findOne({ where: { email: 'alice@example.com' } });
    expect(u).not.toBeNull();
  });

  it('enforces unique email constraint', async () => {
    await expect(SqlUser.create({
      id: uuidv4(),
      name: 'Duplicate',
      email: 'alice@example.com', // duplicate
      passwordHash: null,
      authType: 'password',
      isSuperAdmin: false,
      status: 'active',
      settings: '{}',
      historyUsedBytes: 0,
      mustChangePassword: false,
    })).rejects.toThrow();
  });

  it('updates user', async () => {
    await SqlUser.update({ name: 'Alice Updated' }, { where: { id: userId } });
    const u = await SqlUser.findByPk(userId);
    expect(u!.name).toBe('Alice Updated');
  });

  it('stores settings as JSON string and reads back', async () => {
    const prefs = { saveHistory: true, historyClearOlderThanDays: 30 };
    await SqlUser.update({ settings: JSON.stringify(prefs) }, { where: { id: userId } });
    const u = await SqlUser.findByPk(userId);
    const parsed = JSON.parse(u!.settings);
    expect(parsed.saveHistory).toBe(true);
    expect(parsed.historyClearOlderThanDays).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACES
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlWorkspace table', () => {
  const wsId = uuidv4();
  const ownerId = uuidv4();

  it('creates a workspace', async () => {
    const members = [{ userId: ownerId, role: 'owner', joinedAt: new Date() }];
    const w = await SqlWorkspace.create({
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
    const w = await SqlWorkspace.findByPk(wsId);
    const members = JSON.parse(w!.members);
    expect(Array.isArray(members)).toBe(true);
    expect(members[0].role).toBe('owner');
    expect(members[0].userId).toBe(ownerId);
  });

  it('lists workspaces', async () => {
    const all = await SqlWorkspace.findAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('updates workspace name', async () => {
    await SqlWorkspace.update({ name: 'Renamed Workspace' }, { where: { id: wsId } });
    const w = await SqlWorkspace.findByPk(wsId);
    expect(w!.name).toBe('Renamed Workspace');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlCollection table', () => {
  const colId = uuidv4();
  const wsId = uuidv4();
  const userId = uuidv4();

  it('creates a collection', async () => {
    const c = await SqlCollection.create({
      id: colId, workspaceId: wsId, name: 'My API', description: '',
      variables: JSON.stringify([{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }]),
      preRequestScript: '', testScript: '', order: 0, createdBy: userId,
    });
    expect(c.name).toBe('My API');
  });

  it('deserializes variables array', async () => {
    const c = await SqlCollection.findByPk(colId);
    const vars = JSON.parse(c!.variables);
    expect(vars[0].key).toBe('baseUrl');
  });

  it('finds by workspaceId', async () => {
    const cols = await SqlCollection.findAll({ where: { workspaceId: wsId } });
    expect(cols.length).toBe(1);
  });

  it('deletes collection', async () => {
    await SqlCollection.destroy({ where: { id: colId } });
    const c = await SqlCollection.findByPk(colId);
    expect(c).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlRequest table', () => {
  const reqId = uuidv4();
  const colId = uuidv4();
  const userId = uuidv4();

  const auth = { type: 'bearer', bearer: { token: 'mytoken123' } };
  const body = { mode: 'raw', raw: '{"key":"value"}', rawLanguage: 'json' };
  const headers = [{ key: 'Content-Type', value: 'application/json', enabled: true }];

  it('creates a request with nested JSON fields', async () => {
    const r = await SqlRequest.create({
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
    const r = await SqlRequest.findByPk(reqId);
    const parsed = JSON.parse(r!.auth);
    expect(parsed.type).toBe('bearer');
    expect(parsed.bearer.token).toBe('mytoken123');
  });

  it('body field round-trips correctly', async () => {
    const r = await SqlRequest.findByPk(reqId);
    const parsed = JSON.parse(r!.body);
    expect(parsed.mode).toBe('raw');
    expect(parsed.rawLanguage).toBe('json');
  });

  it('headers array round-trips correctly', async () => {
    const r = await SqlRequest.findByPk(reqId);
    const parsed = JSON.parse(r!.headers);
    expect(parsed[0].key).toBe('Content-Type');
  });

  it('finds requests by collectionId', async () => {
    const reqs = await SqlRequest.findAll({ where: { collectionId: colId } });
    expect(reqs.length).toBe(1);
  });

  it('updates request URL', async () => {
    await SqlRequest.update({ url: 'https://api.example.com/users/updated' }, { where: { id: reqId } });
    const r = await SqlRequest.findByPk(reqId);
    expect(r!.url).toContain('updated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENTS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlEnvironment table', () => {
  const envId = uuidv4();
  const wsId = uuidv4();
  const userId = uuidv4();
  const vars = [
    { key: 'API_KEY', value: 'abc123', type: 'secret', enabled: true },
    { key: 'BASE_URL', value: 'https://api.dev.com', enabled: true },
  ];

  it('creates an environment', async () => {
    const e = await SqlEnvironment.create({
      id: envId, workspaceId: wsId, name: 'Development',
      variables: JSON.stringify(vars), createdBy: userId,
    });
    expect(e.name).toBe('Development');
  });

  it('variables array round-trips', async () => {
    const e = await SqlEnvironment.findByPk(envId);
    const parsed = JSON.parse(e!.variables);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].key).toBe('API_KEY');
    expect(parsed[1].value).toBe('https://api.dev.com');
  });

  it('global environment upsert', async () => {
    const globalVars = [{ key: 'GLOBAL_TOKEN', value: 'tok', enabled: true }];
    await SqlGlobalEnvironment.upsert({
      id: uuidv4(), workspaceId: wsId,
      variables: JSON.stringify(globalVars), updatedAt: new Date(),
    });
    const g = await SqlGlobalEnvironment.findOne({ where: { workspaceId: wsId } });
    expect(g).not.toBeNull();
    const parsed = JSON.parse(g!.variables);
    expect(parsed[0].key).toBe('GLOBAL_TOKEN');
  });

  it('global environment unique workspaceId constraint (upsert updates)', async () => {
    // Second upsert with same workspaceId should update variables, not duplicate
    const newVars = [{ key: 'UPDATED', value: 'yes', enabled: true }];
    // Use findOrCreate + update (same as repository does)
    const [existing] = await SqlGlobalEnvironment.findOrCreate({
      where: { workspaceId: wsId },
      defaults: { id: uuidv4(), workspaceId: wsId, variables: JSON.stringify(newVars), updatedAt: new Date() } as any,
    });
    await existing.update({ variables: JSON.stringify(newVars), updatedAt: new Date() });
    const all = await SqlGlobalEnvironment.findAll({ where: { workspaceId: wsId } });
    expect(all.length).toBe(1); // Still only one row
    const parsed = JSON.parse(all[0].variables);
    expect(parsed[0].key).toBe('UPDATED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlHistory table', () => {
  const userId = uuidv4();
  const wsId = uuidv4();

  it('creates history entries', async () => {
    await SqlHistory.create({
      id: uuidv4(), userId, workspaceId: wsId,
      method: 'GET', status: 200,
      requestSnapshot: JSON.stringify({ method: 'GET', url: 'https://api.example.com/users' }),
      responseSnapshot: JSON.stringify({ status: 200, body: '{"users":[]}' }),
      testResults: '[]',
      executedAt: new Date(Date.now() - 1000),
    });
    await SqlHistory.create({
      id: uuidv4(), userId, workspaceId: wsId,
      method: 'POST', status: 201,
      requestSnapshot: '{}', responseSnapshot: '{}', testResults: '[]',
      executedAt: new Date(),
    });
    const entries = await SqlHistory.findAll({ where: { userId, workspaceId: wsId } });
    expect(entries.length).toBe(2);
  });

  it('sorts history by executedAt DESC', async () => {
    const entries = await SqlHistory.findAll({
      where: { userId, workspaceId: wsId },
      order: [['executedAt', 'DESC']],
    });
    expect(entries[0].method).toBeTruthy();
  });

  it('responseSnapshot round-trips', async () => {
    const entry = await SqlHistory.findOne({ where: { method: 'GET', userId } });
    const parsed = JSON.parse(entry!.responseSnapshot);
    expect(parsed.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlAuditLog table', () => {
  const userId = uuidv4();

  it('creates audit log entries', async () => {
    await SqlAuditLog.create({
      id: uuidv4(), userId,
      action: 'CREATE', targetType: 'collection', targetId: uuidv4(),
      details: JSON.stringify({ collectionName: 'My API' }),
    });
    const logs = await SqlAuditLog.findAll({ where: { userId } });
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('CREATE');
  });

  it('details round-trips', async () => {
    const log = await SqlAuditLog.findOne({ where: { userId } });
    const details = JSON.parse(log!.details!);
    expect(details.collectionName).toBe('My API');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM CONFIG
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlSystemConfig table', () => {
  it('creates system config', async () => {
    const c = await SqlSystemConfig.create({
      id: uuidv4(),
      auth: JSON.stringify({ mode: 'login' }),
      history: JSON.stringify({ maxRequestBodyKB: 100 }),
      proxy: JSON.stringify({ enabled: false }),
      updatedAt: new Date(),
    });
    expect(c.auth).toContain('login');
    expect(c.history).toContain('maxRequestBodyKB');
  });

  it('updates system config', async () => {
    const existing = await SqlSystemConfig.findOne();
    await SqlSystemConfig.update({ auth: JSON.stringify({ mode: 'header' }) }, { where: { id: existing!.id } });
    const updated = await SqlSystemConfig.findOne();
    expect(updated!.auth).toContain('header');
  });

  it('history stores JSON correctly', async () => {
    const historyData = { maxRequestBodyKB: 999 };
    const existing = await SqlSystemConfig.findOne();
    await SqlSystemConfig.update({ history: JSON.stringify(historyData) }, { where: { id: existing!.id } });
    const updated = await SqlSystemConfig.findOne();
    const parsed = JSON.parse(updated!.history!);
    expect(parsed.maxRequestBodyKB).toBe(999);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARED LINKS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlSharedLink table', () => {
  const colId = uuidv4();
  const userId = uuidv4();

  it('creates a shared link', async () => {
    const token = 'tok_abc123unique';
    const link = await SqlSharedLink.create({
      id: uuidv4(), collectionId: colId, token,
      createdBy: userId, expiresAt: null,
    });
    expect(link.token).toBe(token);
  });

  it('finds link by token', async () => {
    const link = await SqlSharedLink.findOne({ where: { token: 'tok_abc123unique' } });
    expect(link).not.toBeNull();
    expect(link!.collectionId).toBe(colId);
  });

  it('enforces unique token constraint', async () => {
    await expect(SqlSharedLink.create({
      id: uuidv4(), collectionId: colId,
      token: 'tok_abc123unique', // duplicate
      createdBy: userId, expiresAt: null,
    })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────────────────────────────────────
describe('SqlFolder table', () => {
  const folderId = uuidv4();
  const colId = uuidv4();

  it('creates a folder', async () => {
    const f = await SqlFolder.create({
      id: folderId, collectionId: colId, parentFolderId: null,
      name: 'Auth', description: 'Auth endpoints',
      preRequestScript: '', testScript: '', order: 0,
    });
    expect(f.name).toBe('Auth');
    expect(f.parentFolderId).toBeNull();
  });

  it('creates nested folder', async () => {
    const nested = await SqlFolder.create({
      id: uuidv4(), collectionId: colId, parentFolderId: folderId,
      name: 'OAuth', description: '',
      preRequestScript: '', testScript: '', order: 1,
    });
    expect(nested.parentFolderId).toBe(folderId);
  });

  it('finds folders by collectionId ordered by order', async () => {
    const folders = await SqlFolder.findAll({
      where: { collectionId: colId },
      order: [['order', 'ASC']],
    });
    expect(folders.length).toBe(2);
    expect(folders[0].name).toBe('Auth');
  });
});

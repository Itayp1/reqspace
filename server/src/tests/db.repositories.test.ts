/**
 * Repository Layer Tests — SQLite in-memory
 *
 * Tests that the UserRepository, WorkspaceRepository, CollectionRepository,
 * RequestRepository, EnvironmentRepository, HistoryRepository, AuditLogRepository,
 * and SystemConfigRepository all work correctly in SQL mode.
 *
 * No MongoDB or external DB required.
 */

import { Sequelize } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

let sq: Sequelize;

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

import { initSqlModels } from '../db/sql-models';
import { UserRepository } from '../repositories/UserRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { HistoryRepository } from '../repositories/HistoryRepository';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';

beforeAll(async () => {
  sq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  initSqlModels();
  await sq.sync({ force: true });
});

afterAll(async () => {
  await sq.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// UserRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('UserRepository (SQL)', () => {
  let userId: string;

  it('creates a user', async () => {
    const u = await UserRepository.create({
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
    const u = await UserRepository.findById(userId);
    expect(u).not.toBeNull();
    expect(u!.name).toBe('Bob');
  });

  it('finds user by email', async () => {
    const u = await UserRepository.findByEmail('bob@example.com');
    expect(u).not.toBeNull();
    expect(u!.id).toBe(userId);
  });

  it('email lookup is case-insensitive', async () => {
    const u = await UserRepository.findByEmail('BOB@EXAMPLE.COM');
    expect(u).not.toBeNull();
  });

  it('returns null for unknown id', async () => {
    const u = await UserRepository.findById(uuidv4());
    expect(u).toBeNull();
  });

  it('updates user', async () => {
    const u = await UserRepository.update(userId, { name: 'Robert' });
    expect(u!.name).toBe('Robert');
  });

  it('lists all users', async () => {
    const users = await UserRepository.list();
    expect(users.length).toBeGreaterThanOrEqual(1);
  });

  it('counts users', async () => {
    const count = await UserRepository.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('existsByEmail returns true for existing', async () => {
    expect(await UserRepository.existsByEmail('bob@example.com')).toBe(true);
  });

  it('existsByEmail returns false for non-existing', async () => {
    expect(await UserRepository.existsByEmail('nobody@example.com')).toBe(false);
  });

  it('deletes user', async () => {
    const tmp = await UserRepository.create({ name: 'Temp', email: 'temp@x.com' });
    await UserRepository.delete(tmp.id);
    const u = await UserRepository.findById(tmp.id);
    expect(u).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkspaceRepository (SQL)', () => {
  let wsId: string;
  const ownerId = uuidv4();

  it('creates a workspace', async () => {
    const w = await WorkspaceRepository.create({ name: 'My Project', ownerId });
    wsId = w.id;
    expect(w.name).toBe('My Project');
    expect(w.ownerId).toBe(ownerId);
  });

  it('adds owner as member automatically', async () => {
    const w = await WorkspaceRepository.findById(wsId);
    expect(w!.members.some(m => m.userId === ownerId && m.role === 'owner')).toBe(true);
  });

  it('finds workspace by id', async () => {
    const w = await WorkspaceRepository.findById(wsId);
    expect(w).not.toBeNull();
    expect(w!.id).toBe(wsId);
  });

  it('finds workspaces for user', async () => {
    const ws = await WorkspaceRepository.findForUser(ownerId);
    expect(ws.some(w => w.id === wsId)).toBe(true);
  });

  it('updates workspace', async () => {
    const w = await WorkspaceRepository.update(wsId, { name: 'My Project (renamed)', description: 'Updated' });
    expect(w!.name).toBe('My Project (renamed)');
    expect(w!.description).toBe('Updated');
  });

  it('lists all workspaces', async () => {
    const all = await WorkspaceRepository.list();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes workspace', async () => {
    const tmp = await WorkspaceRepository.create({ name: 'Tmp', ownerId });
    await WorkspaceRepository.delete(tmp.id);
    expect(await WorkspaceRepository.findById(tmp.id)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CollectionRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('CollectionRepository (SQL)', () => {
  let colId: string;
  const wsId = uuidv4();
  const userId = uuidv4();

  it('creates a collection', async () => {
    const c = await CollectionRepository.create({ workspaceId: wsId, name: 'Payments API', createdBy: userId });
    colId = c.id;
    expect(c.name).toBe('Payments API');
  });

  it('finds collection by id', async () => {
    const c = await CollectionRepository.findById(colId);
    expect(c).not.toBeNull();
  });

  it('finds collections by workspace', async () => {
    await CollectionRepository.create({ workspaceId: wsId, name: 'Auth API', createdBy: userId });
    const cols = await CollectionRepository.findByWorkspace(wsId);
    expect(cols.length).toBe(2);
  });

  it('updates collection with variables', async () => {
    const vars = [{ key: 'baseUrl', value: 'https://pay.api.com', enabled: true }];
    const c = await CollectionRepository.update(colId, { name: 'Payments v2', variables: vars });
    expect(c!.name).toBe('Payments v2');
    expect(c!.variables[0].key).toBe('baseUrl');
  });

  it('deletes collection', async () => {
    await CollectionRepository.delete(colId);
    expect(await CollectionRepository.findById(colId)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FolderRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('FolderRepository (SQL)', () => {
  const colId = uuidv4();
  let folderId: string;

  it('creates a folder', async () => {
    const f = await FolderRepository.create({ collectionId: colId, name: 'Users' });
    folderId = f.id;
    expect(f.name).toBe('Users');
    expect(f.parentFolderId).toBeNull();
  });

  it('creates a sub-folder', async () => {
    const sub = await FolderRepository.create({ collectionId: colId, name: 'Admin', parentFolderId: folderId });
    expect(sub.parentFolderId).toBe(folderId);
  });

  it('finds folders by collection', async () => {
    const folders = await FolderRepository.findByCollection(colId);
    expect(folders.length).toBe(2);
  });

  it('updates folder', async () => {
    const f = await FolderRepository.update(folderId, { name: 'User Endpoints' });
    expect(f!.name).toBe('User Endpoints');
  });

  it('deletes folder', async () => {
    await FolderRepository.delete(folderId);
    expect(await FolderRepository.findById(folderId)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RequestRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('RequestRepository (SQL)', () => {
  const colId = uuidv4();
  const userId = uuidv4();
  let reqId: string;

  it('creates a request', async () => {
    const r = await RequestRepository.create({
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
    const r = await RequestRepository.findById(reqId);
    expect(r!.auth.type).toBe('bearer');
    expect(r!.auth.bearer.token).toBe('mytoken');
  });

  it('headers array round-trips through repository', async () => {
    const r = await RequestRepository.findById(reqId);
    expect(r!.headers[0].key).toBe('Accept');
  });

  it('updates request body', async () => {
    const body = { mode: 'raw', raw: '{"name":"Alice"}', rawLanguage: 'json' };
    const r = await RequestRepository.update(reqId, { body, method: 'POST' });
    expect(r!.method).toBe('POST');
    expect(r!.body.mode).toBe('raw');
    expect(r!.body.rawLanguage).toBe('json');
  });

  it('finds requests by collection', async () => {
    const reqs = await RequestRepository.findByCollection(colId);
    expect(reqs.length).toBe(1);
  });

  it('searches within collection', async () => {
    const results = await RequestRepository.searchInWorkspace('Users', [colId]);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('search returns empty for no match', async () => {
    const results = await RequestRepository.searchInWorkspace('zzz_no_match', [colId]);
    expect(results.length).toBe(0);
  });

  it('deletes request', async () => {
    await RequestRepository.delete(reqId);
    expect(await RequestRepository.findById(reqId)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EnvironmentRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('EnvironmentRepository (SQL)', () => {
  const wsId = uuidv4();
  const userId = uuidv4();
  let envId: string;

  it('creates an environment', async () => {
    const e = await EnvironmentRepository.create({
      workspaceId: wsId, name: 'Staging', createdBy: userId,
      variables: [{ key: 'BASE_URL', value: 'https://staging.api.com', enabled: true }],
    });
    envId = e.id;
    expect(e.name).toBe('Staging');
  });

  it('variables round-trip through repository', async () => {
    const e = await EnvironmentRepository.findById(envId);
    expect(e!.variables[0].key).toBe('BASE_URL');
    expect(e!.variables[0].value).toBe('https://staging.api.com');
  });

  it('finds environments by workspace', async () => {
    const envs = await EnvironmentRepository.findByWorkspace(wsId);
    expect(envs.length).toBeGreaterThanOrEqual(1);
  });

  it('updates environment variables', async () => {
    const newVars = [
      { key: 'BASE_URL', value: 'https://staging-v2.api.com', enabled: true },
      { key: 'API_KEY', value: 'sk-test-123', enabled: true },
    ];
    const e = await EnvironmentRepository.update(envId, { variables: newVars });
    expect(e!.variables.length).toBe(2);
    expect(e!.variables[1].key).toBe('API_KEY');
  });

  it('upserts global environment', async () => {
    const globalVars = [{ key: 'GLOBAL_TIMEOUT', value: '5000', enabled: true }];
    const g = await EnvironmentRepository.upsertGlobal(wsId, globalVars);
    expect(g.variables[0].key).toBe('GLOBAL_TIMEOUT');
  });

  it('global env upsert updates (no duplicates)', async () => {
    const updated = [{ key: 'GLOBAL_TIMEOUT', value: '10000', enabled: true }];
    await EnvironmentRepository.upsertGlobal(wsId, updated);
    const g = await EnvironmentRepository.findGlobal(wsId);
    expect(g!.variables[0].value).toBe('10000');
  });

  it('deletes environment', async () => {
    await EnvironmentRepository.delete(envId);
    expect(await EnvironmentRepository.findById(envId)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HistoryRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('HistoryRepository (SQL)', () => {
  const userId = uuidv4();
  const wsId = uuidv4();

  it('creates history entries', async () => {
    await HistoryRepository.create({
      userId, workspaceId: wsId,
      requestSnapshot: { method: 'GET', url: 'https://api.example.com' },
      responseSnapshot: { status: 200, statusText: 'OK', body: '{"ok":true}', bodyTruncated: false, responseTime: 150, size: 12 },
      testResults: [],
      executedAt: new Date(),
    });
    await HistoryRepository.create({
      userId, workspaceId: wsId,
      requestSnapshot: { method: 'POST', url: 'https://api.example.com/create' },
      responseSnapshot: { status: 201, statusText: 'Created', body: '{}', bodyTruncated: false, responseTime: 300, size: 2 },
      testResults: [],
      executedAt: new Date(),
    });
    const { items } = await HistoryRepository.list({ userId, workspaceId: wsId }, 1, 50);
    expect(items.length).toBe(2);
  });

  it('responseSnapshot round-trips', async () => {
    const { items } = await HistoryRepository.list({ userId, workspaceId: wsId, method: 'GET' }, 1, 50);
    const entry = items[0];
    expect(entry.responseSnapshot.status).toBe(200);
    expect(entry.responseSnapshot.body).toBe('{"ok":true}');
  });

  it('limits history results', async () => {
    const { items } = await HistoryRepository.list({ userId, workspaceId: wsId }, 1, 1);
    expect(items.length).toBe(1);
  });

  it('deletes history by user', async () => {
    await HistoryRepository.deleteMany(userId);
    const { items } = await HistoryRepository.list({ userId, workspaceId: wsId }, 1, 50);
    expect(items.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AuditLogRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('AuditLogRepository (SQL)', () => {
  it('creates and finds audit logs by user', async () => {
    const userId = uuidv4();
    await AuditLogRepository.log({
      userId,
      action: 'test.action',
      targetType: 'User',
      targetId: userId,
      ip: '127.0.0.1',
      details: { foo: 'bar' },
    });

    await AuditLogRepository.log({
      userId,
      action: 'test.action2',
    });

    const logs = await AuditLogRepository.findByUser(userId);
    expect(logs.length).toBe(2);
    // descending order -> most recent first
    expect(logs[0].action).toBe('test.action2');
    expect(logs[1].action).toBe('test.action');
    expect(logs[1].details).toEqual({ foo: 'bar' });
  });

  it('limits results', async () => {
    const userId = uuidv4();
    for (let i = 0; i < 5; i++) {
      await AuditLogRepository.log({ userId, action: `a${i}` });
      // Ensure distinct createdAt values — otherwise same-millisecond inserts
      // tie and the DESC ordering assertion below is non-deterministic.
      await new Promise((r) => setTimeout(r, 5));
    }
    const logs = await AuditLogRepository.findByUser(userId, 3);
    expect(logs.length).toBe(3);
    expect(logs[0].action).toBe('a4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SystemConfigRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('SystemConfigRepository (SQL)', () => {
  it('returns null before config exists', async () => {
    const cfg = await SystemConfigRepository.ensure();
    expect(cfg.auth.mode).toBe('login');
    expect(cfg.history.cleanupPolicy).toBe('fifo');
  });

  it('get returns config after ensure', async () => {
    const cfg = await SystemConfigRepository.getConfig();
    expect(cfg).not.toBeNull();
  });

  it('updates config', async () => {
    const updated = await SystemConfigRepository.updateConfig({
      auth: { mode: 'header', allowSelfRegistration: false }
    });
    expect(updated!.auth.mode).toBe('header');
  });

  it('ensure is idempotent', async () => {
    await SystemConfigRepository.ensure();
    const cfg = await SystemConfigRepository.getConfig();
    expect(cfg).not.toBeNull();
  });
});

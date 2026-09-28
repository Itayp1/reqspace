import request from 'supertest';
import { app, _setDbStatusForTest } from '../index';
import { SqlUser, SqlWorkspace, SqlCollection, SqlRequest, SqlHistory, initSqlModels } from '../db/sql-models';
import { getSequelize, initSequelize } from '../db/sequelize';
import { resolveJwtSecret } from '../utils/jwtSecret';
import { sign } from 'jsonwebtoken';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

describe('TEST-6 Perf Budgets', () => {
  let token: string;
  let workspaceId: string;
  let queryCount = 0;

  beforeAll(async () => {
    _setDbStatusForTest('ok');
    initSequelize({ type: 'sqlite', storagePath: ':memory:' });
    initSqlModels();
    
    const sq = getSequelize();
    await sq.sync({ force: true });
    await SystemConfigRepository.ensure();

    const numUsers = 10;
    const numWorkspaces = 10;
    const numCollections = 100;
    const numRequests = 1000;
    const numHistory = 1000;

    const passwordHash = await bcrypt.hash('password123', 10);

    const users = [];
    for (let i = 0; i < numUsers; i++) {
      users.push({
        id: uuidv4(),
        email: `user${i}@example.com`,
        passwordHash,
        name: `User ${i}`,
        isSuperAdmin: i === 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    await SqlUser.bulkCreate(users);

    const workspaces = [];
        for (let i = 0; i < numWorkspaces; i++) {
      const wsId = uuidv4();
      const ownerId = users[i % users.length].id;
      workspaces.push({
        id: wsId,
        name: `Workspace ${i}`,
        description: `Description ${i}`,
        ownerId: ownerId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    try {
      await SqlWorkspace.bulkCreate(workspaces);
    } catch (err: any) {
      console.error('BULK CREATE ERROR:', err.name, err.message, err.parent);
      throw err;
    }
    
    workspaceId = workspaces[0].id;
    token = sign({ sub: users[0].id }, resolveJwtSecret(), { expiresIn: '1h' });

    const collections = [];
    for (let i = 0; i < numCollections; i++) {
      const wsId = workspaces[i % workspaces.length].id;
      collections.push({
        id: uuidv4(),
        workspaceId: wsId,
        name: `Collection ${i}`,
        description: '',
        order: i,
        auth: JSON.stringify({ type: 'none' }),
        variables: JSON.stringify([]),
        preRequestScript: '',
        testScript: '',
        createdBy: users[0].id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    await SqlCollection.bulkCreate(collections);

    const requests = [];
    for (let i = 0; i < numRequests; i++) {
      const col = collections[i % collections.length];
      requests.push({
        id: uuidv4(),
        collectionId: col.id,
        folderId: null,
        name: `Request ${i}`,
        method: 'GET',
        url: 'https://example.com/api',
        params: JSON.stringify([]),
        headers: JSON.stringify([]),
        auth: JSON.stringify({ type: 'none' }),
        body: JSON.stringify({ mode: 'none' }),
        order: i,
        createdBy: users[0].id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    for(let i = 0; i < requests.length; i+=200) {
      await SqlRequest.bulkCreate(requests.slice(i, i+200));
    }

    const history = [];
    for (let i = 0; i < numHistory; i++) {
      history.push({
        id: uuidv4(),
        userId: users[0].id,
        workspaceId: workspaces[0].id,
        method: 'GET',
        url: 'https://example.com/api',
        statusCode: 200,
        duration: 100,
        requestData: JSON.stringify({}),
        responseData: JSON.stringify({}),
        createdAt: new Date(Date.now() - i * 1000),
        updatedAt: new Date(Date.now() - i * 1000)
      });
    }
    for(let i = 0; i < history.length; i+=200) {
      await SqlHistory.bulkCreate(history.slice(i, i+200));
    }

    (sq as any).options.logging = (msg: any) => {
      queryCount++;
    };
  });

  afterAll(async () => {
    const sq = getSequelize();
    (sq as any).options.logging = false;
    await sq.close();
  });

  beforeEach(() => {
    queryCount = 0;
  });

  it('lists workspaces within budget', async () => {
    const res = await request(app)
      .get(`/api/workspaces`)
      .set('Cookie', `token=${token}`);
    
    expect(res.status).toBe(200);
    expect(queryCount).toBeLessThanOrEqual(5);
  });

  it('opens workspace (loads tree) within budget', async () => {
    const res = await request(app)
      .get(`/api/workspaces/${workspaceId}/tree`)
      .set('Cookie', `token=${token}`);
    
    expect(res.status).toBe(200);
    expect(queryCount).toBeLessThanOrEqual(15);
  });

  it('lists history within budget', async () => {
    const res = await request(app)
      .get(`/api/history?workspaceId=${workspaceId}`)
      .set('Cookie', `token=${token}`);
    
    expect(res.status).toBe(200);
    expect(queryCount).toBeLessThanOrEqual(5);
  });
});

import request from 'supertest';
import { app, _setDbStatusForTest } from '../index';
import { SqlUser, SqlWorkspace, SqlCollection, initSqlModels } from '../db/sql-models';
import { getSequelize, initSequelize } from '../db/sequelize';
import { resolveJwtSecret } from '../utils/jwtSecret';
import { sign } from 'jsonwebtoken';

import { SystemConfigRepository } from '../repositories/SystemConfigRepository';

describe('FEAT-5.1 Collection-level RBAC', () => {
  let editorUser: any;
  let workspace: any;
  let collNarrowed: any;
  let collNormal: any;
  let token: string;

  beforeAll(async () => {
    _setDbStatusForTest('ok');
    initSequelize({ type: 'sqlite', storagePath: ':memory:' });
    initSqlModels();
    await getSequelize().sync();
    await SystemConfigRepository.ensure();

    editorUser = await SqlUser.create({
      name: 'Editor User',
      email: 'editor@example.com',
      passwordHash: 'hash',
    });

    workspace = await SqlWorkspace.create({
      name: 'Test Workspace',
      ownerId: 'some-owner-id',
      members: JSON.stringify([
        { userId: editorUser.id, role: 'editor' }
      ]),
    });

    collNarrowed = await SqlCollection.create({
      workspaceId: workspace.id,
      name: 'Narrowed Collection',
      createdBy: editorUser.id,
      roles: JSON.stringify([
        { userId: editorUser.id, role: 'viewer' }
      ])
    });

    collNormal = await SqlCollection.create({
      workspaceId: workspace.id,
      name: 'Normal Collection',
      createdBy: editorUser.id,
      roles: '[]'
    });

    token = sign({ sub: editorUser.id }, resolveJwtSecret(), { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (workspace?.id) await SqlCollection.destroy({ where: { workspaceId: workspace.id } });
    if (workspace?.id) await SqlWorkspace.destroy({ where: { id: workspace.id } });
    if (editorUser?.id) await SqlUser.destroy({ where: { id: editorUser.id } });
  });

  it('gets 403 on narrowed collection when trying to edit', async () => {
    const res = await request(app)
      .put(`/api/collections/${collNarrowed.id}`)
      .set('Cookie', `token=${token}`)
      .send({ name: 'Renamed' });
    
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Requires editor role/);
  });

  it('gets 200 on normal collection when trying to edit', async () => {
    const res = await request(app)
      .put(`/api/collections/${collNormal.id}`)
      .set('Cookie', `token=${token}`)
      .send({ name: 'Renamed Normal' });
    
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Normal');
  });
});

import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, _setDbStatusForTest } from '../index';
import { SqlUser, SqlWorkspace, SqlCollection, initSqlModels } from '../db/sql-models';
import { getSequelize, initSequelize } from '../db/sequelize';
import { getJwtSecret } from '../utils/secrets';
import { sign } from 'jsonwebtoken';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';

describe('workspace role cache invalidation', () => {
  let owner: any;
  let member: any;
  let workspace: any;
  let collection: any;
  let ownerToken: string;
  let memberToken: string;

  beforeAll(async () => {
    _setDbStatusForTest('ok');
    initSequelize({ type: 'sqlite', storagePath: ':memory:' });
    initSqlModels();
    await getSequelize().sync();
    await SystemConfigRepository.ensure();

    const suffix = randomUUID();
    owner = await SqlUser.create({
      name: 'Role Cache Owner',
      email: `role-cache-owner-${suffix}@example.com`,
      passwordHash: 'hash',
      isSuperAdmin: false,
    });
    member = await SqlUser.create({
      name: 'Role Cache Member',
      email: `role-cache-member-${suffix}@example.com`,
      passwordHash: 'hash',
      isSuperAdmin: false,
    });

    workspace = await SqlWorkspace.create({
      name: 'Role Cache Workspace',
      ownerId: owner.id,
      isPublic: false,
      members: JSON.stringify([
        { userId: owner.id, role: 'owner', joinedAt: new Date().toISOString() },
        { userId: member.id, role: 'viewer', joinedAt: new Date().toISOString() },
      ]),
    });

    collection = await SqlCollection.create({
      workspaceId: workspace.id,
      name: 'Role Cache Collection',
      createdBy: owner.id,
      roles: '[]',
    });

    const secret = getJwtSecret() as string;
    ownerToken = sign({ sub: owner.id }, secret, { expiresIn: '1h' });
    memberToken = sign({ sub: member.id }, secret, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (workspace?.id) await SqlCollection.destroy({ where: { workspaceId: workspace.id } });
    if (workspace?.id) await SqlWorkspace.destroy({ where: { id: workspace.id } });
    if (member?.id) await SqlUser.destroy({ where: { id: member.id } });
    if (owner?.id) await SqlUser.destroy({ where: { id: owner.id } });
  });

  it('allows a collection rename immediately after a cached viewer is promoted to editor', async () => {
    const cached = await request(app)
      .get(`/api/workspaces/${workspace.id}`)
      .set('Cookie', `token=${memberToken}`);
    expect(cached.status).toBe(200);

    const promoted = await request(app)
      .put(`/api/workspaces/${workspace.id}/members/${member.id}`)
      .set('Cookie', `token=${ownerToken}`)
      .send({ role: 'editor' });
    expect(promoted.status).toBe(200);

    const renamed = await request(app)
      .put(`/api/collections/${collection.id}`)
      .set('Cookie', `token=${memberToken}`)
      .send({ name: 'Renamed By Promoted Editor' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Renamed By Promoted Editor');
  });

  it('denies workspace access immediately after a cached editor is removed', async () => {
    const cached = await request(app)
      .get(`/api/workspaces/${workspace.id}`)
      .set('Cookie', `token=${memberToken}`);
    expect(cached.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/workspaces/${workspace.id}/members/${member.id}`)
      .set('Cookie', `token=${ownerToken}`);
    expect(removed.status).toBe(200);

    const after = await request(app)
      .get(`/api/workspaces/${workspace.id}`)
      .set('Cookie', `token=${memberToken}`);
    expect(after.status).toBe(403);
  });
});

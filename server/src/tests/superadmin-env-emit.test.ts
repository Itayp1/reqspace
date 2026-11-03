import request from 'supertest';

jest.mock('../socketUtils', () => ({
  emitToWorkspace: jest.fn(),
}));

import { app, _setDbStatusForTest } from '../index';
import { emitToWorkspace } from '../socketUtils';
import { SqlUser, SqlWorkspace, SqlEnvironment, initSqlModels } from '../db/sql-models';
import { getSequelize, initSequelize } from '../db/sequelize';
import { resolveJwtSecret } from '../utils/jwtSecret';
import { sign } from 'jsonwebtoken';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';

const emit = emitToWorkspace as unknown as jest.Mock;

describe('superadmin environment broadcasts', () => {
  let owner: any;
  let admin: any;
  let workspace: any;
  let envId: string;
  let adminToken: string;

  beforeAll(async () => {
    _setDbStatusForTest('ok');
    initSequelize({ type: 'sqlite', storagePath: ':memory:' });
    initSqlModels();
    await getSequelize().sync();
    await SystemConfigRepository.ensure();

    owner = await SqlUser.create({
      name: 'Env Owner',
      email: 'env-owner-emit@example.com',
      passwordHash: 'hash',
      isSuperAdmin: false,
    });
    admin = await SqlUser.create({
      name: 'Env Admin',
      email: 'env-admin-emit@example.com',
      passwordHash: 'hash',
      isSuperAdmin: true,
    });
    workspace = await SqlWorkspace.create({
      name: 'Env Emit Workspace',
      ownerId: owner.id,
      members: JSON.stringify([{ userId: owner.id, role: 'owner' }]),
    });
    const env = await EnvironmentRepository.create({
      workspaceId: String(workspace.id),
      name: 'Original',
      createdBy: String(owner.id),
    });
    envId = env._id;
    adminToken = sign({ sub: admin.id }, resolveJwtSecret(), { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (envId) await SqlEnvironment.destroy({ where: { id: envId } });
    if (workspace?.id) await SqlWorkspace.destroy({ where: { id: workspace.id } });
    if (owner?.id) await SqlUser.destroy({ where: { id: owner.id } });
    if (admin?.id) await SqlUser.destroy({ where: { id: admin.id } });
  });

  beforeEach(() => {
    emit.mockClear();
  });

  it('broadcasts environment:updated with the workspace id when a superadmin edits', async () => {
    const res = await request(app)
      .put(`/api/environments/${envId}`)
      .set('Cookie', `token=${adminToken}`)
      .send({ name: 'Renamed by admin' });

    expect(res.status).toBe(200);
    expect(emit).toHaveBeenCalledWith(
      String(workspace.id),
      'environment:updated',
      expect.objectContaining({ name: 'Renamed by admin' }),
    );
  });

  it('broadcasts environment:deleted with the workspace id when a superadmin deletes', async () => {
    const res = await request(app)
      .delete(`/api/environments/${envId}`)
      .set('Cookie', `token=${adminToken}`);

    expect(res.status).toBe(204);
    expect(emit).toHaveBeenCalledWith(
      String(workspace.id),
      'environment:deleted',
      envId,
    );
  });
});

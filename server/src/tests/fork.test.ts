import request from 'supertest';
import { app, _setDbStatusForTest } from '../index';
import { SqlUser, SqlWorkspace, SqlEnvironment, SqlCollectionFork, initSqlModels } from '../db/sql-models';
import { getSequelize, initSequelize } from '../db/sequelize';
import { resolveJwtSecret } from '../utils/jwtSecret';
import { sign } from 'jsonwebtoken';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { syncForksOfCollection } from '../routes/forks';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';

describe('Smart Fork (collection fork + auto-sync)', () => {
  let user: any;
  let wsA: any; // source workspace
  let wsB: any; // fork target workspace
  let token: string;

  beforeAll(async () => {
    _setDbStatusForTest('ok');
    initSequelize({ type: 'sqlite', storagePath: ':memory:' });
    initSqlModels();
    await getSequelize().sync();
    await SystemConfigRepository.ensure();

    user = await SqlUser.create({ name: 'Fork User', email: 'forkuser@example.com', passwordHash: 'hash' });
    wsA = await SqlWorkspace.create({ name: 'Workspace A', ownerId: user.id, members: JSON.stringify([{ userId: user.id, role: 'owner' }]) });
    // Forking is restricted to shared → the fork owner's own personal
    // workspace (see routes/forks.ts) — wsB stands in for that personal
    // workspace throughout this file.
    wsB = await SqlWorkspace.create({ name: 'Workspace B', ownerId: user.id, isPersonal: true, members: JSON.stringify([{ userId: user.id, role: 'owner' }]) });
    token = sign({ sub: user.id }, resolveJwtSecret(), { expiresIn: '1h' });
  });

  // Builds: Source Col > Folder A > Folder A.1 > Req 1
  async function makeSourceCollection() {
    const col = await CollectionRepository.create({
      workspaceId: wsA.id, name: 'Source Col', createdBy: user.id,
      variables: [{ key: 'v1', value: '1' }],
    });
    const folderA = await FolderRepository.create({ collectionId: col._id, name: 'Folder A' });
    const folderA1 = await FolderRepository.create({ collectionId: col._id, parentFolderId: folderA._id, name: 'Folder A.1' });
    const reqInA1 = await RequestRepository.create({
      collectionId: col._id, folderId: folderA1._id, name: 'Req 1', method: 'GET', url: 'http://x/1', createdBy: user.id,
    });
    return { col, folderA, folderA1, reqInA1 };
  }

  async function doFork(collectionId: string, body: Record<string, any> = {}) {
    const res = await request(app)
      .post(`/api/collections/${collectionId}/fork`)
      .set('Cookie', `token=${token}`)
      .send({ targetWorkspaceId: wsB.id, ...body });
    expect(res.status).toBe(201);
    return res.body.fork.collection._id as string;
  }

  it('preserves folder hierarchy and request placement when creating the fork', async () => {
    const { col } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);

    const forkedFolders = await FolderRepository.findByCollection(forkedColId);
    expect(forkedFolders).toHaveLength(2);
    const fA = forkedFolders.find(f => f.name === 'Folder A')!;
    const fA1 = forkedFolders.find(f => f.name === 'Folder A.1')!;
    expect(fA1.parentFolderId).toBe(fA._id);

    const forkedRequests = await RequestRepository.findByCollection(forkedColId);
    expect(forkedRequests).toHaveLength(1);
    expect(forkedRequests[0].folderId).toBe(fA1._id);
  });

  it('propagates an upstream change to an item the fork owner never touched', async () => {
    const { col, folderA } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);
    const [forkedFolderA] = await FolderRepository.findByCollection(forkedColId);

    await FolderRepository.update(folderA._id, { testScript: 'pm.test("upstream")' });
    await syncForksOfCollection(col._id);

    const updated = await FolderRepository.findById(forkedFolderA._id);
    expect(updated!.testScript).toBe('pm.test("upstream")');
  });

  it('syncs an upstream folder/collection description change (cosmetic, not hashed, but not silently dropped)', async () => {
    const { col, folderA } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);
    const [forkedFolderA] = await FolderRepository.findByCollection(forkedColId);

    await FolderRepository.update(folderA._id, { description: 'upstream folder description' });
    await CollectionRepository.update(col._id, { description: 'upstream collection description' });
    await syncForksOfCollection(col._id);

    const updatedFolder = await FolderRepository.findById(forkedFolderA._id);
    expect(updatedFolder!.description).toBe('upstream folder description');
    const updatedCol = await CollectionRepository.findById(forkedColId);
    expect(updatedCol!.description).toBe('upstream collection description');
  });

  it('skips an upstream change to an item the fork owner has already modified', async () => {
    const { col, folderA } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);
    const [forkedFolderA] = await FolderRepository.findByCollection(forkedColId);

    await FolderRepository.update(forkedFolderA._id, { testScript: 'pm.test("mine")' });
    await FolderRepository.update(folderA._id, { testScript: 'pm.test("upstream v2")' });
    await syncForksOfCollection(col._id);

    const updated = await FolderRepository.findById(forkedFolderA._id);
    expect(updated!.testScript).toBe('pm.test("mine")');
  });

  it('adds a new upstream item under its correct mapped parent, not collection root', async () => {
    const { col, folderA1 } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);

    const newFolder = await FolderRepository.create({ collectionId: col._id, parentFolderId: folderA1._id, name: 'Folder A.1.1' });
    const newReq = await RequestRepository.create({
      collectionId: col._id, folderId: newFolder._id, name: 'New Req', method: 'GET', url: 'http://x/2', createdBy: user.id,
    });
    void newReq;
    await syncForksOfCollection(col._id);

    const forkedFolders = await FolderRepository.findByCollection(forkedColId);
    const forkedA1 = forkedFolders.find(f => f.name === 'Folder A.1')!;
    const forkedNewFolder = forkedFolders.find(f => f.name === 'Folder A.1.1')!;
    expect(forkedNewFolder.parentFolderId).toBe(forkedA1._id); // not root

    const forkedRequests = await RequestRepository.findByCollection(forkedColId);
    const forkedNewReq = forkedRequests.find(r => r.name === 'New Req')!;
    expect(forkedNewReq.folderId).toBe(forkedNewFolder._id); // not root
  });

  it('removes an unmodified item deleted upstream, cascading its child requests', async () => {
    const { col, folderA1, reqInA1 } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);

    await RequestRepository.delete(reqInA1._id);
    await FolderRepository.delete(folderA1._id);
    await syncForksOfCollection(col._id);

    const forkedFolders = await FolderRepository.findByCollection(forkedColId);
    expect(forkedFolders.find(f => f.name === 'Folder A.1')).toBeUndefined();
    const forkedRequests = await RequestRepository.findByCollection(forkedColId);
    expect(forkedRequests).toHaveLength(0); // cascaded, not left orphaned
  });

  it('does not duplicate a new item when two syncs of the same collection race', async () => {
    const { col } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);

    await FolderRepository.create({ collectionId: col._id, name: 'Racey Folder' });
    await Promise.all([syncForksOfCollection(col._id), syncForksOfCollection(col._id)]);

    const forkedFolders = await FolderRepository.findByCollection(forkedColId);
    expect(forkedFolders.filter(f => f.name === 'Racey Folder')).toHaveLength(1);
  });

  it('refuses to fork into a workspace that is not the caller\'s own personal workspace', async () => {
    const { col } = await makeSourceCollection();
    const sharedWs = await SqlWorkspace.create({ name: 'Another Shared Workspace', ownerId: user.id, members: JSON.stringify([{ userId: user.id, role: 'owner' }]) });

    const res = await request(app)
      .post(`/api/collections/${col._id}/fork`)
      .set('Cookie', `token=${token}`)
      .send({ targetWorkspaceId: sharedWs.id });

    expect(res.status).toBe(400);
  });

  it('refuses to fork into someone else\'s personal workspace', async () => {
    const { col } = await makeSourceCollection();
    const otherUser = await SqlUser.create({ name: 'Other User', email: 'otherforkuser@example.com', passwordHash: 'hash' });
    const otherPersonalWs = await SqlWorkspace.create({ name: 'Other Personal Workspace', ownerId: otherUser.id, isPersonal: true, members: JSON.stringify([{ userId: otherUser.id, role: 'owner' }]) });

    const res = await request(app)
      .post(`/api/collections/${col._id}/fork`)
      .set('Cookie', `token=${token}`)
      .send({ targetWorkspaceId: otherPersonalWs.id });

    expect(res.status).toBe(400);
  });

  it('refuses to fork a collection that already lives in a personal workspace', async () => {
    const personalCol = await CollectionRepository.create({ workspaceId: wsB.id, name: 'Already Personal', createdBy: user.id });

    const res = await request(app)
      .post(`/api/collections/${personalCol._id}/fork`)
      .set('Cookie', `token=${token}`)
      .send({ targetWorkspaceId: wsB.id });

    expect(res.status).toBe(400);
  });

  it('only copies an environment that belongs to the source collection\'s workspace (IDOR guard)', async () => {
    const { col } = await makeSourceCollection();
    const otherWs = await SqlWorkspace.create({ name: 'Unrelated Workspace', ownerId: user.id, members: '[]' });
    const foreignEnv = await SqlEnvironment.create({
      workspaceId: otherWs.id, name: 'Secret Env',
      variables: JSON.stringify([{ key: 'apiKey', value: 'super-secret' }]), createdBy: user.id,
    });

    await doFork(col._id, { copyEnvironmentId: foreignEnv.id });

    const targetEnvs = await SqlEnvironment.findAll({ where: { workspaceId: wsB.id } });
    expect(targetEnvs.find(e => e.name.startsWith('Secret Env'))).toBeUndefined();
  });

  it('honors copyVariables: false, and upstream variable changes still sync in afterward', async () => {
    const { col } = await makeSourceCollection();
    const forkedColId = await doFork(col._id, { copyVariables: false });

    let forkedCol = await CollectionRepository.findById(forkedColId);
    expect(forkedCol!.variables).toEqual([]);

    await CollectionRepository.update(col._id, { variables: [{ key: 'v2', value: '2' }] });
    await syncForksOfCollection(col._id);

    forkedCol = await CollectionRepository.findById(forkedColId);
    expect(forkedCol!.variables).toEqual([{ key: 'v2', value: '2' }]);
  });

  it('detaches a fork via DELETE /collections/:id/fork without touching its contents', async () => {
    const { col } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);

    const delRes = await request(app)
      .delete(`/api/collections/${forkedColId}/fork`)
      .set('Cookie', `token=${token}`);
    expect(delRes.status).toBe(200);

    const statusRes = await request(app)
      .get(`/api/collections/${forkedColId}/fork-status`)
      .set('Cookie', `token=${token}`);
    expect(statusRes.body.isFork).toBe(false);

    // Contents survive detachment
    const forkedCol = await CollectionRepository.findById(forkedColId);
    expect(forkedCol).not.toBeNull();

    // No longer tracked as a fork, so upstream changes stop propagating
    await CollectionRepository.update(col._id, { variables: [{ key: 'after-detach', value: '1' }] });
    await syncForksOfCollection(col._id);
    const stillOld = await CollectionRepository.findById(forkedColId);
    expect(stillOld!.variables).toEqual([{ key: 'v1', value: '1' }]);
  });

  it('surfaces a sync failure on lastSyncError without blocking a sibling fork of the same source', async () => {
    const { col } = await makeSourceCollection();
    const brokenForkColId = await doFork(col._id, { name: 'Broken Fork' });
    const healthyForkColId = await doFork(col._id, { name: 'Healthy Fork' });
    const brokenForkRow = await SqlCollectionFork.findOne({ where: { forkedCollectionId: brokenForkColId } });

    const original = FolderRepository.findByCollection.bind(FolderRepository);
    const spy = jest.spyOn(FolderRepository, 'findByCollection').mockImplementation(async (id: string) => {
      if (id === brokenForkColId) throw new Error('simulated failure');
      return original(id);
    });

    await CollectionRepository.update(col._id, { variables: [{ key: 'v2', value: '2' }] });
    await syncForksOfCollection(col._id);
    spy.mockRestore();

    const updatedBrokenForkRow = await SqlCollectionFork.findByPk(brokenForkRow!.id);
    expect(updatedBrokenForkRow!.lastSyncError).toContain('simulated failure');

    const healthy = await CollectionRepository.findById(healthyForkColId);
    expect(healthy!.variables).toEqual([{ key: 'v2', value: '2' }]);
  });

  it('triggers sync automatically from PUT /folders/:id (wiring, not just the manual endpoint)', async () => {
    const { col, folderA } = await makeSourceCollection();
    const forkedColId = await doFork(col._id);
    const [forkedFolderA] = await FolderRepository.findByCollection(forkedColId);

    const putRes = await request(app)
      .put(`/api/folders/${folderA._id}`)
      .set('Cookie', `token=${token}`)
      .send({ testScript: 'pm.test("via route")' });
    expect(putRes.status).toBe(200);

    // The route fires the sync without awaiting it — poll briefly for it to land.
    let updated: any = null;
    for (let i = 0; i < 40; i++) {
      updated = await FolderRepository.findById(forkedFolderA._id);
      if (updated?.testScript === 'pm.test("via route")') break;
      await new Promise(r => setTimeout(r, 25));
    }
    expect(updated!.testScript).toBe('pm.test("via route")');
  });
});

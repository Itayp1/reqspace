/**
 * Whole-system export / import: encryption envelope, replace and merge round trips (SQLite in-memory).
 */
import { Sequelize } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

let sq: Sequelize;

jest.mock('../db/sequelize', () => {
  const actual = jest.requireActual('../db/sequelize');
  return { ...actual, getSequelize: () => sq, initSequelize: () => sq };
});
jest.mock('../db/connect', () => ({ connectDb: jest.fn() }));

import {
  initSqlModels, SqlUser, SqlWorkspace, SqlCollection, SqlFolder, SqlRequest, SqlEnvironment,
} from '../db/sql-models';
import { buildDump, encryptDump, decryptDump, previewImport, applyImport, TransferError } from '../utils/systemTransfer';

const ids = { admin: uuidv4(), bob: uuidv4(), ws: uuidv4(), col: uuidv4(), parent: uuidv4(), child: uuidv4(), req: uuidv4(), env: uuidv4() };

async function seed() {
  await SqlUser.create({ id: ids.admin, name: 'Admin', email: 'admin@x.test', passwordHash: 'hash-a', authType: 'local', isSuperAdmin: true, status: 'active', settings: '{}', clientCertificates: '[]', historyUsedBytes: 0, mustChangePassword: false, tokenVersion: 0 } as any);
  await SqlUser.create({ id: ids.bob, name: 'Bob', email: 'bob@x.test', passwordHash: 'hash-b', authType: 'local', isSuperAdmin: false, status: 'active', settings: '{}', clientCertificates: JSON.stringify([{ host: 'h', key: 'KEY', passphrase: 'PASS' }]), historyUsedBytes: 0, mustChangePassword: false, tokenVersion: 0 } as any);
  await SqlWorkspace.create({ id: ids.ws, name: 'WS', description: '', ownerId: ids.bob, members: JSON.stringify([{ userId: ids.bob, role: 'owner' }]), isPublic: false, isPersonal: true } as any);
  await SqlCollection.create({ id: ids.col, workspaceId: ids.ws, name: 'Col', createdBy: ids.bob } as any);
  // The child is created first on purpose: import must still insert the parent before it.
  await SqlFolder.create({ id: ids.parent, collectionId: ids.col, parentFolderId: null, name: 'Parent' } as any);
  await SqlFolder.create({ id: ids.child, collectionId: ids.col, parentFolderId: ids.parent, name: 'Child' } as any);
  await SqlRequest.create({ id: ids.req, collectionId: ids.col, folderId: ids.child, name: 'Req', method: 'GET', url: 'http://a', createdBy: ids.bob } as any);
  await SqlEnvironment.create({ id: ids.env, workspaceId: ids.ws, name: 'Env', variables: JSON.stringify([{ key: 'k', currentValue: 'secret-v', type: 'secret' }]), createdBy: ids.bob } as any);
}

beforeAll(async () => {
  sq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  initSqlModels();
  await sq.sync({ force: true });
  await seed();
});
afterAll(() => sq.close());

describe('system transfer', () => {
  it('encrypts with the password and rejects a wrong one', async () => {
    const file = await encryptDump(await buildDump({ includeHistory: false }), 'correct horse');
    expect(file.toString()).not.toContain('secret-v');
    expect(file.toString()).not.toContain('hash-b');
    expect((await decryptDump(file, 'correct horse')).tables.users).toHaveLength(2);
    await expect(decryptDump(file, 'wrong password')).rejects.toMatchObject({ status: 422 });
    await expect(decryptDump(Buffer.from('{"nope":1}'), 'x')).rejects.toBeInstanceOf(TransferError);
  });

  it('merge skips what exists and reuses accounts with the same email', async () => {
    const dump = await buildDump({ includeHistory: false });
    // Same data under a different user id for bob: should be mapped onto the existing bob.
    const otherBob = uuidv4();
    dump.tables.users.find((u: any) => u.email === 'bob@x.test').id = otherBob;
    dump.tables.workspaces[0].id = uuidv4();
    dump.tables.workspaces[0].ownerId = otherBob;
    const prev = await previewImport(dump, 'merge');
    expect(prev.emailConflicts).toBe(2); // admin and bob both exist here
    const res = await applyImport(dump, { mode: 'merge', applyConfig: false });
    expect(res.skipped.users).toBe(2);
    expect(await SqlUser.count()).toBe(2);
    const imported = await SqlWorkspace.findOne({ where: { id: dump.tables.workspaces[0].id } });
    expect(imported?.ownerId).toBe(ids.bob);
    expect(imported?.isPersonal).toBe(false);
  });

  it('replace restores everything into an emptied database', async () => {
    const file = await encryptDump(await buildDump({ includeHistory: false }), 'pw-12345');
    for (const m of [SqlRequest, SqlFolder, SqlCollection, SqlEnvironment, SqlWorkspace, SqlUser]) await (m as any).destroy({ where: {} });
    const res = await applyImport(await decryptDump(file, 'pw-12345'), { mode: 'replace', applyConfig: false });
    expect(res.inserted.users).toBe(2);
    expect(await SqlFolder.count()).toBe(2);
    expect((await SqlRequest.findByPk(ids.req))?.folderId).toBe(ids.child);
    const env = await SqlEnvironment.findByPk(ids.env);
    expect(JSON.parse(env!.variables)[0].currentValue).toBe('secret-v');
    const bob = await SqlUser.findByPk(ids.bob);
    expect(JSON.parse(bob!.clientCertificates)[0].passphrase).toBe('PASS');
  });

  it('refuses a file without an active admin', async () => {
    const dump = await buildDump({ includeHistory: false });
    dump.tables.users = dump.tables.users.filter((u: any) => !u.isSuperAdmin);
    await expect(applyImport(dump, { mode: 'replace', applyConfig: false })).rejects.toBeInstanceOf(TransferError);
    expect(await SqlUser.count()).toBe(2); // nothing was touched
  });
});

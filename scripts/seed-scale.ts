import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { parseArgs } from 'util';
import path from 'path';

// Fix paths since this runs from root/scripts or server/
process.env.DB_STORAGE_PATH = process.env.DB_STORAGE_PATH || 'reqspace-local.sqlite';
const serverDir = path.resolve(__dirname, '../server');
require('ts-node').register({ project: path.join(serverDir, 'tsconfig.json') });

const { sq } = require('../server/src/db/connect');
const { SqlUser, SqlWorkspace, SqlWorkspaceUser, SqlCollection, SqlFolder, SqlRequest, SqlHistory } = require('../server/src/db/models');

async function seed() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      workspaces: { type: 'string', default: '10' },
      collections: { type: 'string', default: '100' },
      requests: { type: 'string', default: '1000' },
      users: { type: 'string', default: '10' },
      history: { type: 'string', default: '1000' },
    }
  });

  const numUsers = parseInt(values.users, 10);
  const numWorkspaces = parseInt(values.workspaces, 10);
  const numCollections = parseInt(values.collections, 10);
  const numRequests = parseInt(values.requests, 10);
  const numHistory = parseInt(values.history, 10);

  console.log(`Seeding: ${numUsers} users, ${numWorkspaces} workspaces, ${numCollections} collections, ${numRequests} requests, ${numHistory} history...`);

  await sq.authenticate();
  await sq.sync();

  const passwordHash = await bcrypt.hash('password123', 10);

  console.log('Inserting users...');
  const users = [];
  for (let i = 0; i < numUsers; i++) {
    users.push({
      _id: uuidv4(),
      email: `user${i}@example.com`,
      passwordHash,
      name: `User ${i}`,
      isSuperAdmin: i === 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  await SqlUser.bulkCreate(users, { ignoreDuplicates: true });
  const allUsers = await SqlUser.findAll({ attributes: ['_id'] });

  console.log('Inserting workspaces...');
  const workspaces = [];
  const workspaceUsers = [];
  for (let i = 0; i < numWorkspaces; i++) {
    const wsId = uuidv4();
    const ownerId = allUsers[i % allUsers.length]._id;
    workspaces.push({
      _id: wsId,
      name: `Workspace ${i}`,
      description: `Description ${i}`,
      createdBy: ownerId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    workspaceUsers.push({
      _id: uuidv4(),
      workspaceId: wsId,
      userId: ownerId,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  await SqlWorkspace.bulkCreate(workspaces, { ignoreDuplicates: true });
  await SqlWorkspaceUser.bulkCreate(workspaceUsers, { ignoreDuplicates: true });
  const allWorkspaces = await SqlWorkspace.findAll({ attributes: ['_id'] });

  console.log('Inserting collections...');
  const collections = [];
  for (let i = 0; i < numCollections; i++) {
    const wsId = allWorkspaces[i % allWorkspaces.length]._id;
    collections.push({
      _id: uuidv4(),
      workspaceId: wsId,
      name: `Collection ${i}`,
      description: '',
      order: i,
      auth: JSON.stringify({ type: 'none' }),
      variables: JSON.stringify([]),
      preRequestScript: '',
      testScript: '',
      createdBy: allUsers[0]._id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  for (let i = 0; i < collections.length; i += 1000) {
    await SqlCollection.bulkCreate(collections.slice(i, i + 1000), { ignoreDuplicates: true });
  }
  const allCollections = await SqlCollection.findAll({ attributes: ['_id', 'workspaceId'] });

  console.log('Inserting requests...');
  const requests = [];
  for (let i = 0; i < numRequests; i++) {
    const col = allCollections[i % allCollections.length];
    requests.push({
      _id: uuidv4(),
      collectionId: col._id,
      folderId: null,
      name: `Request ${i}`,
      method: 'GET',
      url: 'https://example.com/api',
      params: JSON.stringify([]),
      headers: JSON.stringify([]),
      auth: JSON.stringify({ type: 'none' }),
      body: JSON.stringify({ mode: 'none' }),
      order: i,
      createdBy: allUsers[0]._id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  for (let i = 0; i < requests.length; i += 1000) {
    await SqlRequest.bulkCreate(requests.slice(i, i + 1000), { ignoreDuplicates: true });
  }

  console.log('Done!');
  process.exit(0);
}

seed().catch(console.error);

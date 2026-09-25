const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { parseArgs } = require('util');
const path = require('path');

// Fix paths since this runs from root/scripts or server/
process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
process.env.DB_STORAGE_PATH = process.env.DB_STORAGE_PATH || 'reqspace-local.sqlite';
const serverDir = path.resolve(__dirname, '..');
require('ts-node').register({ project: path.join(serverDir, 'tsconfig.json') });

const { initSequelize } = require('../src/db/sequelize');
const { getDbConfig } = require('../src/db/dbConfig');
const sq = initSequelize(getDbConfig());
const { SqlUser, SqlWorkspace, SqlCollection, SqlFolder, SqlRequest, SqlHistory, initSqlModels } = require('../src/db/sql-models');
initSqlModels();

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
      id: uuidv4(),
      email: `user${i}@example.com`,
      passwordHash,
      name: `User ${i}`,
      isSuperAdmin: i === 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: JSON.stringify({}),
      clientCertificates: JSON.stringify([])
    });
  }
  await SqlUser.bulkCreate(users, { ignoreDuplicates: true });
  const allUsers = await SqlUser.findAll({ attributes: ['id'] });

  console.log('Inserting workspaces...');
  const workspaces = [];
  for (let i = 0; i < numWorkspaces; i++) {
    const wsId = uuidv4();
    const ownerId = allUsers[i % allUsers.length].id;
    workspaces.push({
      id: wsId,
      name: `Workspace ${i}`,
      description: `Description ${i}`,
      ownerId: ownerId,
      members: JSON.stringify([]),
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  await SqlWorkspace.bulkCreate(workspaces, { ignoreDuplicates: true });
  const allWorkspaces = await SqlWorkspace.findAll({ attributes: ['id'] });

  console.log('Inserting collections...');
  const collections = [];
  for (let i = 0; i < numCollections; i++) {
    const wsId = allWorkspaces[i % allWorkspaces.length].id;
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
      createdBy: allUsers[0].id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  for (let i = 0; i < collections.length; i += 1000) {
    await SqlCollection.bulkCreate(collections.slice(i, i + 1000), { ignoreDuplicates: true });
  }
  const allCollections = await SqlCollection.findAll({ attributes: ['id', 'workspaceId'] });

  console.log('Inserting requests...');
  const requests = [];
  for (let i = 0; i < numRequests; i++) {
    const col = allCollections[i % allCollections.length];
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
      createdBy: allUsers[0].id,
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

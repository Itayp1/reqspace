import path from 'path';
const serverDir = path.resolve(__dirname, '../server');
require('ts-node').register({ project: path.join(serverDir, 'tsconfig.json') });

const { sq } = require('../server/src/db/connect');
const { SqlUser, SqlWorkspace, SqlWorkspaceUser, SqlCollection, SqlFolder, SqlRequest, SqlHistory } = require('../server/src/db/models');

async function measure() {
  let queryCount = 0;
  sq.options.logging = () => { queryCount++; };

  console.log('Measuring login...');
  queryCount = 0;
  const startLogin = Date.now();
  const user = await SqlUser.findOne({ where: { email: 'user0@example.com' } });
  console.log(`Login: ${Date.now() - startLogin}ms, ${queryCount} queries`);

  console.log('Measuring list workspaces...');
  queryCount = 0;
  const startListWs = Date.now();
  const wsu = await SqlWorkspaceUser.findAll({ where: { userId: user._id } });
  const wsIds = wsu.map((u: any) => u.workspaceId);
  const workspaces = await SqlWorkspace.findAll({ where: { _id: wsIds } });
  console.log(`List workspaces: ${Date.now() - startListWs}ms, ${queryCount} queries`);

  console.log('Measuring open workspace (collections)...');
  queryCount = 0;
  const startOpenWs = Date.now();
  const wsId = workspaces[0]._id;
  const collections = await SqlCollection.findAll({ where: { workspaceId: wsId } });
  // The current app also fetches folders and requests! N+1!
  for (const col of collections) {
      const folders = await SqlFolder.findAll({ where: { collectionId: col._id } });
      const requests = await SqlRequest.findAll({ where: { collectionId: col._id } });
  }
  console.log(`Open workspace: ${Date.now() - startOpenWs}ms, ${queryCount} queries`);

  console.log('Measuring list history...');
  queryCount = 0;
  const startHistory = Date.now();
  const history = await SqlHistory.findAll({ where: { workspaceId: wsId }, limit: 50, order: [['createdAt', 'DESC']] });
  console.log(`List history: ${Date.now() - startHistory}ms, ${queryCount} queries`);

  process.exit(0);
}

measure().catch(console.error);

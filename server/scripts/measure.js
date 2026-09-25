const path = require('path');
process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
process.env.DB_STORAGE_PATH = process.env.DB_STORAGE_PATH || 'reqspace-local.sqlite';
const serverDir = path.resolve(__dirname, '..');
require('ts-node').register({ project: path.join(serverDir, 'tsconfig.json') });

const { initSequelize } = require('../src/db/sequelize');
const { getDbConfig } = require('../src/db/dbConfig');
const sq = initSequelize(getDbConfig());
const { SqlUser, SqlWorkspace, SqlCollection, SqlFolder, SqlRequest, SqlHistory, initSqlModels } = require('../src/db/sql-models');
initSqlModels();

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
  // With ownerId or member
  const workspaces = await SqlWorkspace.findAll({ where: { ownerId: user.id } });
  console.log(`List workspaces: ${Date.now() - startListWs}ms, ${queryCount} queries`);

  console.log('Measuring open workspace (collections)...');
  queryCount = 0;
  const startOpenWs = Date.now();
  const wsId = workspaces[0].id;
  const collections = await SqlCollection.findAll({ where: { workspaceId: wsId }, limit: 200 });
  const ids = collections.map(c => c.id);
  if (ids.length > 0) {
    const folders = await SqlFolder.findAll({ where: { collectionId: { [sq.Sequelize.Op.in]: ids } } });
    const requests = await SqlRequest.findAll({ where: { collectionId: { [sq.Sequelize.Op.in]: ids } }, attributes: ['id', 'collectionId', 'folderId', 'name', 'method', 'order'] });
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

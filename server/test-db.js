const { Sequelize, DataTypes } = require('sequelize');
const sq = new Sequelize({ dialect: 'sqlite', storage: 'reqspace-local.sqlite', logging: false });
async function run() {
  const [results] = await sq.query('SELECT auth FROM SystemConfigs');
  console.log(results);
  process.exit(0);
}
run();

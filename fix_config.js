const fs = require('fs');

// 1. Update SystemConfig.ts defaults
let configCode = fs.readFileSync('c:/projects/reqspace/server/src/models/SystemConfig.ts', 'utf8');
configCode = configCode.replace(/maxRequestBodyKB: \{ type: Number, default: 5120 \}/, 'maxRequestBodyKB: { type: Number, default: 300 }');
configCode = configCode.replace(/maxTotalPerUserMB: \{ type: Number, default: 100 \}/, 'maxTotalPerUserMB: { type: Number, default: 5 }');
configCode = configCode.replace(/maxRequestBodyKB: 5120/, 'maxRequestBodyKB: 300');
configCode = configCode.replace(/maxTotalPerUserMB: 100/, 'maxTotalPerUserMB: 5');
fs.writeFileSync('c:/projects/reqspace/server/src/models/SystemConfig.ts', configCode, 'utf8');

// 2. We'll write a small mongo migration to update existing global config
const migration = `
const mongoose = require('mongoose');
async function migrate() {
  await mongoose.connect('mongodb://127.0.0.1:27017/reqspace');
  const db = mongoose.connection;
  await db.collection('systemconfigs').updateOne(
    { _id: 'global' },
    { $set: { 'history.maxRequestBodyKB': 300, 'history.maxTotalPerUserMB': 5 } }
  );
  console.log('Migration done');
  process.exit(0);
}
migrate();
`;
fs.writeFileSync('c:/projects/reqspace/server/migrate_config.js', migration, 'utf8');

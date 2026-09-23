
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

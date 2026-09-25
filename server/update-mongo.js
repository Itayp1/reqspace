const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb://localhost:27017/reqspace-web');
  const db = mongoose.connection.db;
  await db.collection('systemconfigs').updateOne({ _id: 'global' }, { $set: { 'auth.allowSelfRegistration': true } }, { upsert: true });
  console.log('Updated systemconfigs!');
  process.exit(0);
}
run();

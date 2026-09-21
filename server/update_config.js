const mongoose = require('./node_modules/mongoose');
mongoose.connect('mongodb+srv://REDACTED:REDACTED@REDACTED.mongodb.net/REDACTED', {tlsInsecure:true}).then(async () => {
  const db = mongoose.connection.db;
  await db.collection('systemconfigs').updateOne({_id: 'global'}, { $set: { 'auth.mode': 'both', 'auth.headerName': 'uid' } }, {upsert: true});
  console.log('Config updated');
  process.exit(0);
});

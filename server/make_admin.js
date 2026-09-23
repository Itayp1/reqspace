require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

// Usage: node make_admin.js someone@example.com
const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error('Usage: node make_admin.js <email>');
  process.exit(1);
}

const UserSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true },
  isSuperAdmin: Boolean
}, { collection: 'users' });

const User = mongoose.model('User', UserSchema);

async function run() {
  try {
    // tlsInsecure previously disabled certificate verification on the Atlas
    // connection (MITM risk) — removed; use a correct MONGO_URI/CA setup
    // instead of bypassing TLS verification.
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const email = targetEmail.toLowerCase();

    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      console.log('User not found. Trying without lowercase just in case...');
      user = await User.findOne({ email: targetEmail });
    }
    
    if (user) {
      user.isSuperAdmin = true;
      await user.save();
      console.log('Successfully made ' + user.email + ' a super admin.');
    } else {
      console.log('User not found in DB! Cannot make admin.');
    }
    
  } catch(e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
  }
}

run();

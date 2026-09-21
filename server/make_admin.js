require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true },
  isSuperAdmin: Boolean
}, { collection: 'users' });

const User = mongoose.model('User', UserSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { tlsInsecure: true });
    console.log('Connected to DB');
    
    const email = 'Peretz.itay@gmail.com'.toLowerCase();
    
    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      console.log('User not found. Trying without lowercase just in case...');
      user = await User.findOne({ email: 'Peretz.itay@gmail.com' });
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

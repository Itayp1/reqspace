// Test-only helper: resets the seeded superadmin back to its default
// first-boot state (default password, mustChangePassword=true) directly in
// the DB. Run once from tests/global-setup.ts before the suite starts, so
// admin.spec.ts / comprehensive-permissions.spec.ts always exercise the real
// forced "change password on first login" flow instead of depending on
// whatever a previous local run happened to leave the password as.
//
// Never run this against a real deployment — it clobbers the live admin
// account's password.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getDbConfig } = require('./dist/db/dbConfig');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin').toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

async function main() {
  const config = getDbConfig();
  if (config.type !== 'mongodb') {
    console.log(`reset-admin-for-tests: skipping, DB type is "${config.type}" not mongodb`);
    return;
  }

  await mongoose.connect(config.connectionString, { tlsInsecure: true });
  try {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    const result = await mongoose.connection.collection('users').updateOne(
      { email: ADMIN_EMAIL },
      { $set: { passwordHash, mustChangePassword: true, authType: 'password', status: 'active' } }
    );

    if (result.matchedCount === 0) {
      console.error(`reset-admin-for-tests: no user found with email "${ADMIN_EMAIL}" — nothing reset.`);
      process.exitCode = 1;
    } else {
      console.log(`reset-admin-for-tests: reset "${ADMIN_EMAIL}" to the default password (mustChangePassword=true).`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('reset-admin-for-tests: failed:', err.message);
  process.exitCode = 1;
});

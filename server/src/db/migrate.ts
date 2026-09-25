import 'dotenv/config';
import { getDbConfig } from './dbConfig';
import { connectDb } from './connect';

async function main() {
  const config = getDbConfig();
  await connectDb(config);
  console.log('✅ Migrations applied');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

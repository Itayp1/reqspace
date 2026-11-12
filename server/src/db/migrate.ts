import 'dotenv/config';
import { getDbConfig } from './dbConfig';
import { connectDb } from './connect';
import { recordError } from '../utils/errorReporter';

async function main() {
  const config = getDbConfig();
  await connectDb(config);
  console.log('✅ Migrations applied');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  Promise.race([
    recordError({ source: 'server', kind: 'process', message: `Migration failed: ${err?.message ?? err}`, stack: err?.stack ?? null }),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]).finally(() => process.exit(1));
});

import fs from 'fs';
import path from 'path';
import { seedPerfData } from './perf-seed';

// Marks the start of the run for global-teardown's fperrors summary and clears
// the previous run's list of intentionally-provoked faults.
export default async function globalSetup() {
  process.env.REQSPACE_E2E_RUN_STARTED = new Date().toISOString();
  const allowedLog = path.resolve(__dirname, '..', '..', process.env.REQSPACE_RESULTS_DIR || 'test-results', '.fperrors-allowed.jsonl');
  try { fs.rmSync(allowedLog, { force: true }); } catch { /* nothing to clear */ }
  // Bulk data for the search-latency spec (loaded once, removed in global-teardown). sqlite only: it writes the DB file directly.
  if ((process.env.DB_TYPE || 'sqlite') === 'sqlite' && process.env.REQSPACE_E2E_DB_PATH && process.env.REQSPACE_PERF_SEED !== 'off') {
    await seedPerfData(process.env.REQSPACE_API_URL || 'http://localhost:3005', process.env.REQSPACE_E2E_DB_PATH);
  }
}

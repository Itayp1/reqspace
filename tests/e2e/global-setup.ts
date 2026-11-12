import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { seedPerfData } from './perf-seed';

// Runtime settings live in the database (Admin > Settings > Server), not the
// environment. The suite needs the limiters off (unless this is the @ratelimit
// run) and every repeated fault recorded, so set them through the admin API
// once the server is up.
async function applyTestServerSettings(apiUrl: string): Promise<void> {
  const ctx = await request.newContext({ baseURL: apiUrl, extraHTTPHeaders: { 'X-Forwarded-For': '10.255.0.2' } });
  try {
    // The server never seeds a superadmin; create it through first-run setup (409 = already created).
    const setup = await ctx.post('/api/auth/setup', { data: { name: 'Admin', email: 'admin', password: 'admin123456' } });
    if (!setup.ok() && setup.status() !== 409) throw new Error(`global-setup: first-run setup failed (${setup.status()})`);
    const passwords = ['admin123456'];
    let loggedIn = false;
    for (const password of passwords) {
      const res = await ctx.post('/api/auth/login', { data: { email: 'admin', password } });
      if (res.ok()) { loggedIn = true; break; }
    }
    if (!loggedIn) throw new Error('global-setup: could not log in as the seeded admin to apply test server settings');
    const res = await ctx.put('/api/admin/config', {
      data: {
        server: {
          rateLimit: {
            enabled: process.env.DISABLE_RATE_LIMIT === 'false',
            mutationMax: 300,
            readMax: 2000,
          },
          errorDedupeMs: 0,
          // OAuth redirects go back to the client port the suite runs on (CLIENT_PORT, default 5173).
          oauthAllowedRedirectUris: ['google', 'github', 'microsoft', 'custom'].map(
            (provider) => `http://localhost:${process.env.CLIENT_PORT || '5173'}/auth/${provider}/callback`,
          ),
          // The suite sends X-Forwarded-For for per-test rate-limit buckets and drives the
          // API from the Vite client's origin (R5.5: neither is trusted by default).
          trustProxy: '1',
          allowedOrigins: [process.env.REQSPACE_WEB_URL || 'http://localhost:5173'],
          captureAuthFailures: process.env.FPERRORS_CAPTURE_AUTH_FAILURES !== 'false',
        },
      },
    });
    if (!res.ok()) throw new Error(`global-setup: PUT /api/admin/config failed (${res.status()})`);
  } finally {
    await ctx.dispose();
  }
}

// Marks the start of the run for global-teardown's fperrors summary and clears
// the previous run's list of intentionally-provoked faults.
export default async function globalSetup() {
  process.env.REQSPACE_E2E_RUN_STARTED = new Date().toISOString();
  const allowedLog = path.resolve(__dirname, '..', '..', process.env.REQSPACE_RESULTS_DIR || 'test-results', '.fperrors-allowed.jsonl');
  try { fs.rmSync(allowedLog, { force: true }); } catch { /* nothing to clear */ }
  if (process.env.REQSPACE_TARGET !== 'electron') {
    await applyTestServerSettings(process.env.REQSPACE_API_URL || 'http://localhost:3005');
  }
  // Bulk data for the search-latency spec (loaded once, removed in global-teardown). sqlite only: it writes the DB file directly.
  if ((process.env.DB_TYPE || 'sqlite') === 'sqlite' && process.env.REQSPACE_E2E_DB_PATH && process.env.REQSPACE_PERF_SEED !== 'off') {
    await seedPerfData(process.env.REQSPACE_API_URL || 'http://localhost:3005', process.env.REQSPACE_E2E_DB_PATH);
  }
}

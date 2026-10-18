import { defineConfig, devices } from '@playwright/test';
import os from 'os';
import path from 'path';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
// Global target for performance (in milliseconds)
process.env.PERF_TIMEOUT = '100';
// The server below runs with the limiters off unless told otherwise; specs read this same variable
// (e.g. the @ratelimit tests skip themselves when it is 'true').
process.env.DISABLE_RATE_LIMIT ??= 'true';

// A fresh, uniquely-named file per run — NOT ':memory:'. Sequelize's default
// connection pool (max 5) opens multiple connections, and each ':memory:'
// connection gets its own private, empty database; a real browser session's
// concurrent requests can land on a second connection that never saw the
// seeded admin, causing intermittent login failures. A real file is shared
// correctly across pooled connections and still starts empty every run.
// Kept in the environment so worker processes (which load this file again)
// and global-teardown's direct fperrors read agree on the one file in use.
process.env.REQSPACE_E2E_DB_PATH ??= path.join(os.tmpdir(), `reqspace-e2e-${Date.now()}-${process.pid}.sqlite`);
const sqliteTestDbPath = process.env.REQSPACE_E2E_DB_PATH;

// Ports are injectable so parallel git worktrees (orchestrate_bugs.sh) never collide.
// PORT = API server, CLIENT_PORT = Vite client (the baseURL). Defaults are the dev ports.
const PORT = process.env.PORT || '3005';
const CLIENT_PORT = process.env.CLIENT_PORT || '5173';
const API_BASE = `http://localhost:${PORT}`;
const CLIENT_BASE = `http://localhost:${CLIENT_PORT}`;
// Specs that open the client by absolute URL (e.g. V4.2) read this.
process.env.REQSPACE_WEB_URL ??= CLIENT_BASE;
// @ratelimit specs need the limiters on, which the regular server has off: the regular run leaves them
// out and `npm run test:e2e:all` runs them last on a server started with DISABLE_RATE_LIMIT=false.
const RATELIMIT_RUN = process.env.DISABLE_RATE_LIMIT === 'false';
// Workers re-load this file; specs/fixtures read the API URL from the environment.
process.env.REQSPACE_API_URL ??= API_BASE;

export default defineConfig({
  testDir: './tests/e2e',
  /* Per-target output so two runs in parallel (scripts/run-e2e-targets.js) never wipe each other's results. */
  outputDir: process.env.REQSPACE_RESULTS_DIR || 'test-results',
  /* Every test fails if it leaves new rows in the fperrors table (see
     tests/e2e/fixtures.ts); the teardown re-checks the table directly at the
     end of the run. */
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),
  /* DB wiping for non-sqlite backends happens in scripts/wipe-db.js, run as a
     separate step BEFORE `playwright test` (see package.json's test:e2e) —
     not as Playwright globalSetup. Playwright starts webServer before running
     globalSetup, so a wipe done there would truncate the admin user the
     server's bootstrap just seeded. */
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* One retry locally too: with 62 tests hitting a single dev server + a
     remote DB, an occasional timeout under load is infra noise, not a bug. */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. Cap local workers — this app runs many
     real API round-trips per test against one Node process; uncapped workers
     (= CPU core count) overload it and produce load-induced flakes. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: CLIENT_BASE,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* The app's CodeGen "Copy" button uses navigator.clipboard, which Chromium
       blocks without an explicit grant in an automated context. */
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'sqlite',
      use: { ...devices['Desktop Chrome'] },
      // Desktop-only specs/tests (tagged @electron) run only with REQSPACE_TARGET=electron.
      testIgnore: [/.*extension.spec.ts/, /.*electron-app.spec.ts/],
      grepInvert: RATELIMIT_RUN ? /@electron/ : /@electron|@ratelimit/,
    },
    {
      name: 'postgres',
      use: { ...devices['Desktop Chrome'] },
      // Desktop-only specs/tests (tagged @electron) run only with REQSPACE_TARGET=electron.
      testIgnore: [/.*extension.spec.ts/, /.*electron-app.spec.ts/],
      grepInvert: RATELIMIT_RUN ? /@electron/ : /@electron|@ratelimit/,
    },
    {
      name: 'mysql',
      use: { ...devices['Desktop Chrome'] },
      // Desktop-only specs/tests (tagged @electron) run only with REQSPACE_TARGET=electron.
      testIgnore: [/.*extension.spec.ts/, /.*electron-app.spec.ts/],
      grepInvert: RATELIMIT_RUN ? /@electron/ : /@electron|@ratelimit/,
    },
    {
      // Same specs, run inside the real Electron app (REQSPACE_TARGET=electron, see tests/e2e/electron-target.ts).
      name: 'electron',
      // Measured: passing tests take p50 4s / p99 13s / max 18s on an idle machine, and 20s was too tight once
      // several shards ran at once (tests that pass alone timed out). 30s keeps headroom; lower it with
      // REQSPACE_ELECTRON_TIMEOUT_MS when running a single shard.
      timeout: Number(process.env.REQSPACE_ELECTRON_TIMEOUT_MS || 30_000),
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*extension.spec.ts/,
    },
    {
      name: 'extension',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*extension\.spec\.ts/,
    },
  ].filter(p => (process.env.REQSPACE_TARGET === 'electron')
    ? p.name === 'electron'
    : p.name !== 'electron' && (process.env.CI || p.name === 'sqlite' || p.name === process.env.DB_TYPE)),

  /* Run your local dev server before starting the tests.
     reuseExistingServer is false locally so a stale server left over from an
     earlier session (wrong DB, wrong env) never gets silently reused — that
     was the source of tests hitting an unexpected server/DB. In CI it must be
     true: the workflow pre-starts and health-checks its own server on this
     exact port before Playwright runs, so Playwright has to reuse it instead
     of racing to bind a second process to the same port. */
  webServer: [
    {
      command: 'npm run dev --prefix server',
      url: API_BASE,
      reuseExistingServer: !!process.env.CI,
      env: {
        NODE_ENV: 'test',
        MUTATION_RATE_LIMIT_MAX: process.env.MUTATION_RATE_LIMIT_MAX || '300',
        READ_RATE_LIMIT_MAX: process.env.READ_RATE_LIMIT_MAX || '2000',
        DB_TYPE: process.env.DB_TYPE || 'sqlite',
        DB_STORAGE_PATH: sqliteTestDbPath,
        PORT,
        DEV_ORIGINS: CLIENT_BASE,
        ALLOW_DEFAULT_ADMIN: 'true',
        // The suite sends X-Forwarded-For to get per-test rate-limit buckets; the server
        // no longer trusts it by default (R5.5), so opt in here.
        TRUST_PROXY: process.env.TRUST_PROXY ?? '1',
        // UI tests register/log in many users from one IP and would hit the
        // per-IP login/register limits. The few tests that assert the limiters
        // themselves are tagged @ratelimit and run with DISABLE_RATE_LIMIT=false.
        DISABLE_RATE_LIMIT: process.env.DISABLE_RATE_LIMIT ?? 'true',
        // Record every occurrence of a fault, so a retry that hits the same
        // error is caught too instead of falling inside the dedupe window.
        FPERRORS_DEDUPE_MS: '0',
        ADMIN_PASSWORD: 'admin',
        CERT_ENCRYPTION_KEY: process.env.CERT_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      }
    },
    {
      command: `npm run dev --prefix client -- --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_BASE,
      env: { REQSPACE_PROXY_TARGET: API_BASE },
      reuseExistingServer: !!process.env.CI,
    }
  ],
});


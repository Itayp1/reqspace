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

// A fresh, uniquely-named file per run — NOT ':memory:'. Sequelize's default
// connection pool (max 5) opens multiple connections, and each ':memory:'
// connection gets its own private, empty database; a real browser session's
// concurrent requests can land on a second connection that never saw the
// seeded admin, causing intermittent login failures. A real file is shared
// correctly across pooled connections and still starts empty every run.
const sqliteTestDbPath = path.join(os.tmpdir(), `reqspace-e2e-${Date.now()}.sqlite`);

export default defineConfig({
  testDir: './tests/e2e',
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
    baseURL: 'http://localhost:5173',

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
      testIgnore: /.*extension\.spec\.ts/,
    },
    {
      name: 'postgres',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*extension\.spec\.ts/,
    },
    {
      name: 'mysql',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*extension\.spec\.ts/,
    },
    {
      name: 'extension',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*extension\.spec\.ts/,
    },
  ].filter(p => process.env.CI || p.name === 'sqlite' || p.name === process.env.DB_TYPE),

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
      url: 'http://localhost:3005',
      reuseExistingServer: !!process.env.CI,
      env: {
        NODE_ENV: 'test',
        MUTATION_RATE_LIMIT_MAX: process.env.MUTATION_RATE_LIMIT_MAX || '300',
        READ_RATE_LIMIT_MAX: process.env.READ_RATE_LIMIT_MAX || '2000',
        DB_TYPE: process.env.DB_TYPE || 'sqlite',
        DB_STORAGE_PATH: sqliteTestDbPath,
        PORT: '3005',
        ALLOW_DEFAULT_ADMIN: 'true',
        ADMIN_PASSWORD: 'admin',
        CERT_ENCRYPTION_KEY: process.env.CERT_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      }
    },
    {
      command: 'npm run dev --prefix client',
      url: 'http://localhost:5173',
      reuseExistingServer: !!process.env.CI,
    }
  ],
});


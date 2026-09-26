import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
// Global target for performance (in milliseconds)
process.env.PERF_TIMEOUT = '100';

export default defineConfig({
  testDir: './tests/e2e',
  /* Resets the seeded superadmin and walks it through the forced first-login
     password change exactly once, before any test file runs. See
     tests/global-setup.ts for why this can't be done per-file. */
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* One retry locally too: with 36 tests hitting a single dev server + a
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
    },
    {
      name: 'postgres',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mysql',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'extension',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*extension\.spec\.ts/,
    },
  ].filter(p => process.env.CI || p.name === 'sqlite' || p.name === process.env.DB_TYPE),

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run dev --prefix server',
      url: 'http://localhost:3005',
      reuseExistingServer: true,
      env: {
        DB_TYPE: process.env.DB_TYPE || 'sqlite',
        PORT: '3005',
        ALLOW_DEFAULT_ADMIN: 'true',
        CERT_ENCRYPTION_KEY: process.env.CERT_ENCRYPTION_KEY || 'test-key-32-chars-long-1234567890'
      }
    },
    {
      command: 'npm run dev --prefix client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    }
  ],
});

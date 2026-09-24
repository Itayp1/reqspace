import { defineConfig, devices } from '@playwright/test';

const matrix = [
  { name: 'sqlite', base: process.env.SQLITE_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005', enabled: true },
  { name: 'postgres', base: process.env.POSTGRES_BASE_URL || 'http://localhost:3012', enabled: !!process.env.POSTGRES_URL },
  { name: 'mysql', base: process.env.MYSQL_BASE_URL || 'http://localhost:3013', enabled: !!process.env.MYSQL_URL },
  { name: 'mongodb', base: process.env.MONGODB_BASE_URL || 'http://localhost:3014', enabled: !!(process.env.MONGODB_URI || process.env.MONGO_URI) },
];
if (process.env.CI) {
  for (const leg of matrix) {
    if (!leg.enabled) throw new Error(`CI must run the ${leg.name} database leg (connection string missing)`);
  }
}
const dbProjects = matrix.filter((leg) => leg.enabled).map((leg) => ({
  name: leg.name,
  use: { ...devices['Desktop Chrome'], baseURL: leg.base },
}));

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
export default defineConfig({
  testDir: './tests',
  /* Resets the seeded superadmin and walks it through the forced first-login
     password change exactly once, before any test file runs. See
     tests/global-setup.ts for why this can't be done per-file. */
  globalSetup: require.resolve('./tests/global-setup'),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* One retry locally too: with ~800 tests hitting a single dev server + a
     remote DB, an occasional timeout under load is infra noise, not a bug. */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. Cap local workers — this app runs many
     real API round-trips per test against one Node process; uncapped workers
     (= CPU core count) overload it and produce load-induced flakes. */
  workers: process.env.CI ? 1 : 4,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* The app's CodeGen "Copy" button uses navigator.clipboard, which Chromium
       blocks without an explicit grant in an automated context. */
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  /* Configure projects for major browsers */
  projects: dbProjects,

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});

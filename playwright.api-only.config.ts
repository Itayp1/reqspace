import { defineConfig, devices } from '@playwright/test';
// Scratch config: runs specs against an already-started server (REQSPACE_API_URL), no webServer.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),
  workers: 1, retries: 0, reporter: 'line',
  use: { baseURL: process.env.REQSPACE_WEB_URL || 'http://localhost:5173', permissions: ['clipboard-read', 'clipboard-write'] },
  projects: [{ name: 'sqlite', use: { ...devices['Desktop Chrome'] } }],
});

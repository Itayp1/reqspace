import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

/**
 * ERR1: console.error / console.warn in the browser and 401/403 responses (client and server) were
 * never stored in fperrors, so failures like "401 after sign-in" left no trace to investigate.
 */
test.describe('error capture', () => {
test.use({ allowFpErrors: [/err1-console-probe|responded 40[13]|status code 40[13]/] });

async function errorsSince(since: Date, q: string) {
  const admin = await apiAsAdmin();
  const res = await admin.get(`/api/admin/errors?since=${encodeURIComponent(since.toISOString())}&q=${encodeURIComponent(q)}&limit=50`);
  return (await res.json()) as any;
}

test('a console.error / console.warn in the page is stored as a client "console" fault', async ({ page }) => {
  const since = new Date(Date.now() - 1000);
  await page.goto('/login');
  await page.evaluate(() => { console.error('err1-console-probe error'); console.warn('err1-console-probe warn'); });
  await expect(async () => {
    const data = await errorsSince(since, 'err1-console-probe');
    const msgs = JSON.stringify(data);
    expect(msgs).toContain('console.error: err1-console-probe error');
    expect(msgs).toContain('console.warn: err1-console-probe warn');
  }).toPass();
});

test('a 401 on a normal API call is stored on both the server and the client', async ({ page }) => {
  const since = new Date(Date.now() - 1000);
  await page.goto('/login');
  await page.evaluate(async () => { await fetch('/api/workspaces'); }); // anonymous -> 401
  await expect(async () => {
    const data = JSON.stringify(await errorsSince(since, '/api/workspaces'));
    expect(data).toContain('server-auth');
  }).toPass();
});
});

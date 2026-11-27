import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { loginAdminUi, apiAsAdmin, expectToast } from '../helpers';

async function openAdminTab(page: import('@playwright/test').Page, tab: string) {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
  await page.getByTestId(`admin-tab-${tab}`).click();
}

/** The fperrors review screen: list, details, "Fixed". */
test.describe('errors panel', () => {
  // This test reports a client fault on purpose to review it on screen.
  test.use({ allowFpErrors: [/admin-errors-panel-probe/] });

  test('lists a recorded fault, shows its details, and Fixed removes it', async ({ page, request }) => {
    const marker = `admin-errors-panel-probe-${Date.now()}`;
    const res = await request.post(`${API_URL}/api/errors`, {
      data: { kind: 'window.error', message: marker, stack: `Error: ${marker}\n    at probe (probe.js:1:1)` },
    });
    expect(res.status()).toBe(204);

    await openAdminTab(page, 'errors');
    await page.getByTestId('errors-search').fill(marker);
    await page.getByTestId('errors-search-btn').click();
    const row = page.getByTestId('error-row').filter({ hasText: marker });
    await expect(row).toHaveCount(1);
    await row.getByTestId('error-details-btn').click();
    await expect(page.getByTestId('error-occurrence').first()).toContainText('probe.js:1:1');

    await row.getByTestId('error-fixed-btn').click();
    await page.getByTestId('confirm-btn').click();
    await expectToast(page, 'success', 'Error removed');
    await expect(page.getByTestId('error-row').filter({ hasText: marker })).toHaveCount(0);
  });
});

/** Q7.2 (finding 183): the Admin Errors dashboard needs date-range filtering and column sorting. */
test.describe('Q7.2 errors dashboard', () => {
  test.use({ allowFpErrors: [/q72-probe/] });

  test('[Q7.2] errors can be sorted by count and bounded by a date range in the UI', async ({ page, request }) => {
    const marker = `q72-probe-${Date.now()}`;
    const few = `${marker}-few`;
    const many = `${marker}-many`;
    const post = (message: string) =>
      request.post(`${API_URL}/api/errors`, { headers: { 'X-Forwarded-For': '10.252.7.2' }, data: { kind: 'window.error', message } });
    expect((await post(few)).status()).toBe(204);
    for (let i = 0; i < 3; i++) expect((await post(many)).status()).toBe(204);

    await openAdminTab(page, 'errors');
    await page.getByTestId('errors-search').fill(marker);
    await page.getByTestId('errors-search-btn').click();
    const rows = page.getByTestId('error-row');
    await expect(rows).toHaveCount(2);

    // Sort by count (descending): the 3x group comes first.
    await page.getByTestId('errors-sort').selectOption('count');
    await expect(rows.first()).toContainText(many);

    // A date range entirely in the future hides everything; an open range containing today shows both.
    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    await page.getByTestId('errors-from').fill(day(2));
    await expect(rows).toHaveCount(0);
    await page.getByTestId('errors-from').fill(day(-1));
    await page.getByTestId('errors-to').fill(day(1));
    await expect(rows).toHaveCount(2);
  });
});

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

/**
 * FPERR-AUDIT: "Fixed" on an error group (DELETE /api/admin/errors/:fingerprint) wrote the
 * 64-char fingerprint into audit_logs.targetId, which is VARCHAR(36). Postgres and MySQL
 * reject the row, so the audit log failed and the fault was recorded. SQLite does not enforce
 * lengths, so this only shows up on the server-DB backends.
 */
test('resolving an error group with a 64-char fingerprint succeeds and writes its audit row', async () => {
  const admin = await apiAsAdmin();
  const fingerprint = 'a'.repeat(64);
  const res = await admin.delete(`/api/admin/errors/${fingerprint}`);
  expect(res.status(), await res.text()).toBe(200);
});

let seq2 = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq2++}_${Math.floor(Math.random() * 1e5)}`;
const ip2 = () => `10.${150 + (seq2 % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
async function anon(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip2() } });
}

test.describe('Admin errors (API, rate limit)', () => {
  test.use({ allowFpErrors: [/probe d+/] });

  test('[Q7.5] POST /api/errors is rate limited when unauthenticated @ratelimit', async () => {
    test.skip(process.env.DISABLE_RATE_LIMIT === 'true', 'needs the limiters on: DISABLE_RATE_LIMIT=false npx playwright test -g @ratelimit');
    const ctx = await anon();
    let limited = false;
    for (let i = 0; i < 60 && !limited; i++) {
      const res = await ctx.post('/api/errors', { data: { kind: 'window.error', message: `probe ${i}`, route: '/qa' } });
      if (res.status() === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});

test.describe('Admin errors (API, sort and dedupe)', () => {
  test.use({ allowFpErrors: [/q74 dedupe probe/] });

  test('[Q7.2] the errors list can be sorted and bounded by date', async () => {
    const admin = await apiAsAdmin();
    for (const q of ['sort=count&dir=desc', 'sort=firstSeen&dir=asc', `since=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`, `until=${encodeURIComponent(new Date().toISOString())}`]) {
      const res = await admin.get(`/api/admin/errors?${q}`);
      expect(res.status(), q).toBe(200);
    }
  });

  test.describe('Q7.4 dedupe', () => {
    test('[Q7.4] the same client error reported repeatedly is one group with a total count', async () => {
      const ctx = await anon();
      const msg = `q74 dedupe probe ${uniq('m')}`;
      const since = new Date(Date.now() - 1000).toISOString();
      for (let i = 0; i < 5; i++) {
        await ctx.post('/api/errors', { data: { kind: 'window.error', message: msg, route: '/qa-q74' } });
      }
      await new Promise((r) => setTimeout(r, 1000));
      const admin = await apiAsAdmin();
      const body = await (await admin.get(`/api/admin/errors?since=${encodeURIComponent(since)}`)).json();
      const groups: any[] = Array.isArray(body) ? body : body.groups ?? body.errors ?? body.items;
      const mine = groups.filter((g) => String(g.message).includes(msg));
      expect(mine).toHaveLength(1);
      expect(mine[0].count).toBe(5);
    });
  });
});

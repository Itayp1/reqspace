import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_URL } from './fixtures';

/** K1.3 (finding 146): the History search box must also match the response status code. */

let seq = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
const ip = () => `10.${120 + (seq % 30)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

const entry = (status: number, url: string) => ({
  requestSnapshot: { method: 'GET', url, headers: [], params: [], body: { mode: 'none' } },
  responseBody: 'ok', responseStatus: status, responseStatusText: 'S', responseHeaders: {}, responseTime: 5, responseSize: 2,
});

test('[K1.3] history search filters by response status code', async ({ page }) => {
  const email = `${uniq('k13ui')}@example.com`;
  const ctx: APIRequestContext = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  expect((await ctx.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } })).status()).toBe(201);
  const wsList = await (await ctx.get('/api/workspaces')).json();
  const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
  const wsId = (ws.id ?? ws._id) as string;
  await ctx.post(`/api/workspaces/${wsId}/history`, { data: entry(200, 'http://h.test/okpath') });
  await ctx.post(`/api/workspaces/${wsId}/history`, { data: entry(404, 'http://h.test/missingpath') });

  // Reuse the API session (UI login is rate limited) and satisfy the CSRF origin check.
  await page.context().addCookies((await ctx.storageState()).cookies);
  await page.context().route('**/api/**', async (r) => {
    if (r.request().method() === 'GET') return r.fallback();
    const res = await r.fetch({ headers: { ...r.request().headers(), origin: 'http://localhost:5173' } });
    await r.fulfill({ response: res });
  });
  await page.goto('/');
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await page.getByTestId('tab-history').click();
  await expect(page.getByTestId('history-item')).toHaveCount(2);

  await page.getByPlaceholder('Search history...').fill('404');
  await expect(page.getByTestId('history-item')).toHaveCount(1);
  await expect(page.getByTestId('history-item').first()).toContainText('missingpath');
});

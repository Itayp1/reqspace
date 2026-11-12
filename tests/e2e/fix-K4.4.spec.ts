import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL } from './fixtures';

/** K4.4: "Clear All" in History must only remove the filtered entries while a search is active. */

let seq = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
const ip = () => `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const idOf = (o: any) => (o.id ?? o._id) as string;

const hist = (url: string) => ({
  requestSnapshot: { method: 'GET', url, headers: [], body: { mode: 'none' } },
  responseBody: 'ok', responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 5, responseSize: 2,
});

async function newUser(prefix: string) {
  const email = `${uniq(prefix)}@example.com`;
  const ctx: APIRequestContext = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
  expect(res.status(), 'register').toBe(201);
  const wsList = await (await ctx.get('/api/workspaces')).json();
  const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
  return { ctx, email, wsId: idOf(ws) };
}

async function loginUi(page: Page, ctx: APIRequestContext) {
  await page.context().addCookies((await ctx.storageState()).cookies);
  // The server's CSRF check only whitelists the dev origin :5173; this run's client may be on another port.
  await page.context().route('**/api/**', async (r) => {
    if (r.request().method() === 'GET') return r.fallback();
    const res = await r.fetch({ headers: { ...r.request().headers(), origin: 'http://localhost:5173' } });
    await r.fulfill({ response: res });
  });
  await page.goto('/');
  await expect(page.getByTestId('workspace-select')).toBeVisible();
}

test.describe('K — history', () => {
  test('[K4.4] Clear with an active search removes only the filtered history entries', async ({ page }) => {
    const u = await newUser('k44ui');
    await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist('http://keep.test/one') });
    await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist('http://keep.test/two') });
    await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist('http://drop.test/a') });
    await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist('http://drop.test/b') });

    await loginUi(page, u.ctx);
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item')).toHaveCount(4);

    await page.getByPlaceholder('Search history...').fill('drop.test');
    await expect(page.getByTestId('history-item')).toHaveCount(2);

    await page.getByRole('button', { name: /^Clear/ }).first().click();
    await page.getByTestId('confirm-btn').click();
    await expect(page.getByTestId('history-item')).toHaveCount(0);

    const body = await (await u.ctx.get(`/api/workspaces/${u.wsId}/history?limit=200`)).json();
    const urls = body.items.map((i: any) => i.requestSnapshot.url).sort();
    expect(urls).toEqual(['http://keep.test/one', 'http://keep.test/two']);
  });
});

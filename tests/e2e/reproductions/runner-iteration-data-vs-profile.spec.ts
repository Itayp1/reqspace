import { test, expect } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL } from '../fixtures';
import { openNodeMenu } from '../helpers';

/**
 * Finding 93: the Runner's iteration data (CSV/JSON row) is documented to
 * override every other variable scope, but a profile variable of the same
 * name used to win over it.
 */
const ts = Date.now();
const ip = () => `10.${200 + Math.floor(Math.random() * 40)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function newUser() {
  const ctx: APIRequestContext = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  const res = await ctx.post('/api/auth/register', { data: { name: 'Iter User', email: `iter_${ts}@example.com`, password: 'password123' } });
  expect(res.status(), 'register').toBe(201);
  const wsList = await (await ctx.get('/api/workspaces')).json();
  const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
  return { ctx, wsId: (ws.id ?? ws._id) as string };
}

async function loginWithCookies(page: Page, ctx: APIRequestContext) {
  await page.context().addCookies((await ctx.storageState()).cookies);
  // The server's CSRF check only whitelists the dev origin :5173; this run's client is on another port.
  await page.context().route('**/api/**', async (r) => {
    if (r.request().method() === 'GET') return r.fallback();
    const res = await r.fetch({ headers: { ...r.request().headers(), origin: 'http://localhost:5173' } });
    await r.fulfill({ response: res });
  });
  await page.goto('/');
  await expect(page.getByTestId('workspace-select')).toBeVisible();
}

test('iteration data wins over a profile variable of the same name', async ({ page }) => {
  const { ctx, wsId } = await newUser();
  const profile = await ctx.put('/api/user-profile-variables', { data: { variables: [{ key: 'name', value: 'from-profile', enabled: true }] } });
  expect(profile.ok(), await profile.text()).toBeTruthy();

  const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'IterCol' } })).json();
  const reqRes = await ctx.post(`/api/collections/${col.id ?? col._id}/requests`, {
    data: { method: 'GET', name: 'A', url: 'http://runner-test.local/echo?n={{name}}' },
  });
  expect(reqRes.ok(), await reqRes.text()).toBeTruthy();

  const seen: string[] = [];
  await page.route('http://runner-test.local/*', async (r) => {
    seen.push(new URL(r.request().url()).search);
    await r.fulfill({ status: 200, body: 'ok' });
  });

  await loginWithCookies(page, ctx);
  await openNodeMenu(page, 'IterCol');
  await page.getByTestId('action-menu-run-collection').click();
  await expect(page.getByTestId('collection-runner-modal')).toBeVisible();
  await page.getByTestId('collection-runner-data-file').setInputFiles({
    name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from('name\nfrom-csv\n'),
  });
  await page.getByTestId('collection-runner-run-btn').click();

  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0]).toBe('?n=from-csv');
});

import { test, expect } from '../fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_URL } from '../fixtures';
import { registerUser, apiAsAdmin } from '../helpers';


/** HIST1: saving history for a binary response (its text contains NUL) was refused with 400 by the global NUL guard. */
test('history accepts a response body that contains NUL characters', async () => {
  const admin = await apiAsAdmin();
  const workspaces = await (await admin.get('/api/workspaces')).json();
  const wsId = workspaces[0]._id;
  const res = await admin.post(`/api/workspaces/${wsId}/history`, {
    data: {
      requestSnapshot: { method: 'GET', url: 'https://example.test/file.zip' },
      responseBody: 'PK\u0003\u0004\u0000ÿþ\u0000\u0001\u0002',
      responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 5, responseSize: 10,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
});


/** History is capped per user in each workspace (default 10 MB); the oldest entries are deleted first. */
test('history over the per-workspace cap drops the oldest entries', async ({ page }) => {
  const admin = await apiAsAdmin();
  await admin.put('/api/admin/config', { data: { history: { maxTotalPerWorkspaceMB: 1 } } });
  try {
    await registerUser(page, 'histcap');
    const list = await (await page.request.get('/api/workspaces')).json();
    const wsId = (Array.isArray(list) ? list : list.workspaces)[0]._id;
    const body = 'x'.repeat(400 * 1024);
    for (let i = 0; i < 5; i++) {
      const res = await page.request.post(`/api/workspaces/${wsId}/history`, {
        data: {
          requestSnapshot: { method: 'GET', url: `https://cap.example.com/${i}`, headers: {}, params: [], body: '' },
          responseBody: body, responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 1, responseSize: body.length,
        },
      });
      expect(res.status(), await res.text()).toBe(201);
    }
    const { items, total } = await (await page.request.get(`/api/workspaces/${wsId}/history?limit=50`)).json();
    expect(total).toBeLessThanOrEqual(2);
    expect(items[0].url).toBe('https://cap.example.com/4');

    // A burst of concurrent saves must not overshoot the cap either (the prune is serialised per user + workspace).
    const save = (i: number) => page.request.post(`/api/workspaces/${wsId}/history`, {
      data: { requestSnapshot: { method: 'GET', url: `https://burst.example.com/${i}`, headers: {}, params: [], body: '' }, responseBody: body, responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 1, responseSize: body.length },
    });
    for (const r of await Promise.all(Array.from({ length: 8 }, (_, i) => save(i)))) expect(r.status()).toBe(201);
    const after = await (await page.request.get(`/api/workspaces/${wsId}/history?limit=50`)).json();
    expect(after.total).toBeLessThanOrEqual(3);
  } finally {
    await admin.put('/api/admin/config', { data: { history: { maxTotalPerWorkspaceMB: 10 } } });
  }
});

let seq = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
const ip = () => `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
async function newUser(prefix: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email: `${uniq(prefix)}@example.com`, password: 'password123' } });
  expect(res.status(), 'register').toBe(201);
  return ctx;
}

async function newWorkspace(ctx: APIRequestContext) {
  const res = await ctx.post('/api/workspaces', { data: { name: uniq('ws') } });
  expect(res.ok(), 'create workspace').toBeTruthy();
  const ws = await res.json();
  return (ws.id ?? ws._id) as string;
}

const entry = {
  requestSnapshot: { method: 'GET', url: 'http://example.test/x', headers: [], params: [] },
  responseBody: 'ok', responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 5, responseSize: 2,
};

const count = async (ctx: APIRequestContext, ws: string) =>
  (await (await ctx.get(`/api/workspaces/${ws}/history`)).json()).items.length as number;

test('[K4.6] DELETE /api/history requires a workspaceId and never wipes other workspaces', async () => {
  const ctx = await newUser('fixk46');
  const wsA = await newWorkspace(ctx);
  const wsB = await newWorkspace(ctx);
  expect((await ctx.post(`/api/workspaces/${wsA}/history`, { data: entry })).status()).toBe(201);
  expect((await ctx.post(`/api/workspaces/${wsB}/history`, { data: entry })).status()).toBe(201);

  // No workspaceId -> rejected, nothing deleted.
  expect((await ctx.delete('/api/history')).status()).toBe(400);
  expect(await count(ctx, wsA)).toBe(1);
  expect(await count(ctx, wsB)).toBe(1);

  // With workspaceId -> only that workspace is cleared.
  expect((await ctx.delete(`/api/history?workspaceId=${wsA}`)).status()).toBe(200);
  expect(await count(ctx, wsA)).toBe(0);
  expect(await count(ctx, wsB)).toBe(1);
});

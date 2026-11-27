import { test, expect } from '../fixtures';
import http from 'node:http';
import { seedRequest } from '../requests/seed';
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

test('a 1MB response is not stored in history; history keeps only a size note', async ({ page }) => {
  const item = JSON.stringify({ id: 1, name: 'x'.repeat(90) });
  const body = '[' + Array(Math.ceil(1024 * 1024 / (item.length + 1))).fill(item).join(',') + ']';
  const srv = http.createServer((_q, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(body);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(srv.address() as any).port}/mid`;
  try {
    await seedRequest(page, 'midresp', url);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');

    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item')).toHaveCount(1);
    const wsList = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    const wsId = ws.id ?? ws._id;
    const hist = await (await page.request.get(`/api/workspaces/${wsId}/history`)).json();
    expect(hist.items).toHaveLength(1);
    const stored = hist.items[0].responseSnapshot;
    expect(stored.status).toBe(200);
    expect(stored.body).toMatch(/not saved to history: 1\.0 MB, over the 512 KB limit/);
  } finally {
    srv.close();
  }
});

test.describe('History filtering and clearing (API)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('[K1.3] history can be filtered by status code', async () => {
    const ctx = await newUser('k13');
    const wsId = await newWorkspace(ctx);
    await ctx.post(`/api/workspaces/${wsId}/history`, { data: entry });
    await ctx.post(`/api/workspaces/${wsId}/history`, { data: { ...entry, responseStatus: 404 } });
    const body = await (await ctx.get(`/api/workspaces/${wsId}/history?status=404`)).json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i: any) => i.statusCode === 404)).toBe(true);
  });

  test('[K4.4] clearing history is scoped to one workspace', async () => {
    const ctx = await newUser('k44');
    const wsA = await newWorkspace(ctx);
    const wsB = await newWorkspace(ctx);
    await ctx.post(`/api/workspaces/${wsA}/history`, { data: entry });
    await ctx.post(`/api/workspaces/${wsB}/history`, { data: entry });
    await ctx.delete(`/api/workspaces/${wsA}/history`);
    expect((await (await ctx.get(`/api/workspaces/${wsB}/history`)).json()).items).toHaveLength(1);
  });
});

import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_URL } from './fixtures';

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

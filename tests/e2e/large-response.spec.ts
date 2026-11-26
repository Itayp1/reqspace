import http from 'node:http';
import { statSync } from 'node:fs';
import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('a 100MB JSON response shows "too large", keeps the page responsive and saves to a file', async ({ page }) => {
  test.setTimeout(240_000);
  // A real server: Playwright's route.fulfill cannot carry 100MB over its debug pipe.
  const item = JSON.stringify({ id: 1, name: 'x'.repeat(90), tags: ['a', 'b', 'c'] });
  const big = '[' + Array(Math.ceil(100 * 1024 * 1024 / (item.length + 1))).fill(item).join(',') + ']';
  const srv = http.createServer((_q, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(big);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(srv.address() as any).port}/big`;

  try {
    // The dev server only accepts the Origin of the default client port (5173); this run uses another port.
    await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
    await registerUser(page, 'bigresp');
    const wsList = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    const wsId = ws.id ?? ws._id;
    const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
    const colId = col.id ?? col._id;
    const r = await page.request.post(`/api/collections/${colId}/requests`, { data: { name: 'Req', method: 'GET', url } });
    expect(r.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('node-Col').click();
    await page.getByTestId('node-Req').click();
    await page.getByTestId('request-send-btn').click();

    await expect(page.getByText('Response too large')).toBeVisible({ timeout: 120_000 });
    // The main thread must not be frozen by a JSON.parse/stringify of the whole body.
    const t0 = Date.now();
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => res(null))));
    expect(Date.now() - t0).toBeLessThan(2000);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByTestId('large-response-save').click(),
    ]);
    expect(statSync(await download.path()).size).toBeGreaterThan(90 * 1024 * 1024);
  } finally {
    srv.close();
  }
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
    await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
    await registerUser(page, 'midresp');
    const wsList = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    const wsId = ws.id ?? ws._id;
    const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
    const colId = col.id ?? col._id;
    expect((await page.request.post(`/api/collections/${colId}/requests`, { data: { name: 'Req', method: 'GET', url } })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('node-Col').click();
    await page.getByTestId('node-Req').click();
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');

    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item')).toHaveCount(1);
    const hist = await (await page.request.get(`/api/workspaces/${wsId}/history`)).json();
    expect(hist.items).toHaveLength(1);
    const stored = hist.items[0].responseSnapshot;
    expect(stored.status).toBe(200);
    expect(stored.body).toMatch(/not saved to history: 1\.0 MB, over the 512 KB limit/);
  } finally {
    srv.close();
  }
});

import http from 'node:http';
import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// A server that answers but sends no Access-Control-Allow-Origin: the browser reports it as a bare
// "Failed to fetch". The response must say it is CORS and that the extension is not installed.
test('[CORS] a request blocked by CORS says so and points to the extension', async ({ page }) => {
  const srv = http.createServer((_q, s) => { s.end('ok'); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as any).port;
  try {
    await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
    await registerUser(page, 'cors1');
    const wsList = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    const col = await (await page.request.post(`/api/workspaces/${ws.id ?? ws._id}/collections`, { data: { name: 'Col' } })).json();
    const r = await page.request.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'Req', method: 'GET', url: `http://127.0.0.1:${port}/x` } });
    expect(r.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('node-Col').click();
    await page.getByTestId('node-Req').click();
    await page.getByTestId('request-send-btn').click();
    const body = page.getByTestId('response-body-viewer');
    await expect(body).toContainText('Blocked by CORS');
    await expect(body).toContainText("Extension not installed");
  } finally { srv.close(); }
});

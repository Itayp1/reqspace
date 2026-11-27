import http from 'node:http';
import { test, expect } from '../fixtures';
import { seedRequest } from '../requests/seed';

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

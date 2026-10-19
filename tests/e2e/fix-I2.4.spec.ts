import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';
import { registerUser } from './helpers';

const BODY = { a: { b: [{ n: 'ALPHA' }, { n: 'BRAVO' }] }, items: [{ id: 'ID_ONE' }, { id: 'ID_TWO', sub: { id: 'ID_DEEP' } }], other: 'NOPE_VALUE' };

async function mockServer(page: Page) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  await page.route('https://mock.test/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BODY), headers: cors });
  });
}

test('[I2.4] JSON Path filter supports recursive ($..id) and wildcard ($.a.b[*]) expressions', async ({ page }) => {
  await mockServer(page);
  await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
  await registerUser(page, 'i24');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const wsId = ws.id ?? ws._id;
  const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
  const r = await page.request.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'Req', method: 'GET', url: 'https://mock.test/x' } });
  expect(r.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await page.getByTestId('node-Col').click();
  await page.getByTestId('node-Req').click();
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');

  const viewer = page.getByTestId('response-body-viewer');
  const filter = page.getByPlaceholder('Filter JSON...');

  await filter.fill('$..id');
  await expect(viewer).toContainText('ID_DEEP');
  await expect(viewer).toContainText('ID_ONE');
  await expect(viewer).not.toContainText('NOPE_VALUE');
  await expect(viewer).not.toContainText('Invalid JSON path');

  await filter.fill('$.a.b[*]');
  await expect(viewer).toContainText('ALPHA');
  await expect(viewer).toContainText('BRAVO');
  await expect(viewer).not.toContainText('No match');
  await expect(viewer).not.toContainText('Invalid JSON path');
});

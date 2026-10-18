import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('[I4.5] an SSL/certificate failure explains SSL and hints at turning off Verify SSL', async ({ page }) => {
  // The dev server only accepts the Origin of the default client port (5173); this run uses another port.
  await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
  await registerUser(page, 'i45');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const wsId = ws.id ?? ws._id;
  const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
  const colId = col.id ?? col._id;
  const r = await page.request.post(`/api/collections/${colId}/requests`, { data: { name: 'Req', method: 'GET', url: 'https://selfsigned.test/x' } });
  expect(r.ok()).toBeTruthy();
  // Simulate the browser's opaque failure for a bad certificate.
  await page.route('https://selfsigned.test/**', (route) => route.abort('failed'));
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await page.getByTestId('node-Col').click();
  await page.getByTestId('node-Req').click();
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('Network Error');
  const body = page.getByTestId('response-body-viewer');
  await expect(body).toContainText(/certificate/i);
  await expect(body).toContainText(/turn\s+off\s+.{0,2}Verify\s+SSL/i);
});

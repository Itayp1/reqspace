import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test.describe('I4.4 mixed content error explanation', () => {
  test('[I4.4] a blocked plain-HTTP request mentions mixed content, not only CORS', async ({ page }) => {
    await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
    await registerUser(page, 'i44');
    const wsList = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    const wsId = ws.id ?? ws._id;
    const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
    const colId = col.id ?? col._id;
    const r = await page.request.post(`/api/collections/${colId}/requests`, { data: { name: 'Req', method: 'GET', url: 'http://127.0.0.1:1/x' } });
    expect(r.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('node-Col').click();
    await page.getByTestId('node-Req').click();
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('Network Error');
    await expect(page.getByTestId('response-body-viewer')).toContainText(/mixed\s+content/i);
  });
});

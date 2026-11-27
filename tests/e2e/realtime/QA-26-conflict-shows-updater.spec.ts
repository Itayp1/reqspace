import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// QA-26 / QA-39: the conflict dialog must say who updated the request and when.
test('[QA-26] conflict dialog names the last editor and time', async ({ page }) => {
  await registerUser(page, 'qa26', 'Alice Editor');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const col = await (await page.request.post(`/api/workspaces/${ws.id ?? ws._id}/collections`, { data: { name: 'Col26' } })).json();
  const created = await (await page.request.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'Req26', method: 'GET', url: 'https://mock.test/a' } })).json();
  await page.reload();
  await page.getByTestId('node-Col26').click();
  const loaded = page.waitForResponse(r => /\/api\/requests\/[^/]+$/.test(r.url()) && r.request().method() === 'GET');
  await page.getByTestId('node-Req26').click();
  await loaded;

  // Local edits first so the tab is dirty when the remote change arrives
  await page.getByTestId('request-url-input').fill('https://mock.test/local');

  // A newer server version appears (saved elsewhere), then this tab saves with local edits.
  await page.request.put(`/api/requests/${created.id ?? created._id}`, { data: { url: 'https://mock.test/elsewhere' } });
  const got = await (await page.request.get(`/api/requests/${created.id ?? created._id}`)).json();
  expect(got.updatedByName).toBe('Alice Editor');

  await page.getByTestId('request-save-btn').click();
  await expect(page.locator('#confirm-modal-description')).toContainText('updated by Alice Editor');
});

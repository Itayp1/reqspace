import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// QA-44: dragging a request onto a sibling request reorders it and the order persists.
test('[QA-44] drag request onto sibling reorders and persists', async ({ page }) => {
  await registerUser(page, 'qa44');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const col = await (await page.request.post(`/api/workspaces/${ws.id ?? ws._id}/collections`, { data: { name: 'Col44' } })).json();
  const cid = col.id ?? col._id;
  for (const [i, name] of ['R-A', 'R-B', 'R-C'].entries()) {
    await page.request.post(`/api/collections/${cid}/requests`, { data: { name, method: 'GET', url: 'https://mock.test/x', order: i } });
  }
  await page.reload();
  await page.getByTestId('node-Col44').click();
  await expect(page.getByTestId('node-R-C')).toBeVisible();

  await page.getByTestId('node-R-C').dragTo(page.getByTestId('node-R-A'));

  await expect(async () => {
    const reqs: any[] = await (await page.request.get(`/api/collections/${cid}/requests`)).json();
    expect(reqs.sort((a, b) => a.order - b.order).map(r => r.name)).toEqual(['R-C', 'R-A', 'R-B']);
  }).toPass();
});

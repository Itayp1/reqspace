import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test('the gear next to a collection opens its settings without right-click', async ({ page }) => {
  await registerUser(page, 'gear');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const wsId = ws.id ?? ws._id;
  expect((await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();

  await page.getByTestId('node-Col').hover();
  await page.getByTestId('settings-Col').click();
  await expect(page.getByRole('dialog', { name: 'Edit collection Col' })).toBeVisible();
  await expect(page.getByTestId('group-edit-variables-tab')).toBeVisible();
});

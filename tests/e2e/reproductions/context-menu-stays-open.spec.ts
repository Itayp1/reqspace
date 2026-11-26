import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test('a right-click menu closes when you right-click elsewhere or the window loses focus', async ({ page }) => {
  await registerUser(page, 'ctxopen');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const wsId = ws.id ?? ws._id;
  expect((await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();

  const menu = page.getByRole('menu');
  await page.getByTestId('node-Col').click({ button: 'right' });
  await expect(menu).toBeVisible();

  // Right-click on an area that has no menu of its own: the native menu would open, ours must close.
  await page.mouse.click(900, 10, { button: 'right' });
  await expect(menu).toBeHidden();

  // Window loses focus (alt-tab, click into an iframe).
  await page.getByTestId('node-Col').click({ button: 'right' });
  await expect(menu).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(menu).toBeHidden();
});

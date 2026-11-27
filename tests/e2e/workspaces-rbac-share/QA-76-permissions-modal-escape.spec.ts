import { test, expect } from '../fixtures';
import { loginAdminUi, apiAsAdmin } from '../helpers';

/** QA-76: Escape must close the admin Manage Permissions modal even when focus is outside it; an inner confirm closes first. */
test('Escape closes the Manage Permissions modal, inner confirm first', async ({ page }) => {
  const admin = await apiAsAdmin();
  const wsName = `QA76 WS ${Date.now()}`;
  await admin.post('/api/workspaces', { data: { name: wsName } });
  await admin.dispose();

  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await page.getByTestId('admin-tab-workspaces').click();
  await page.getByTestId(`admin-manage-permissions-${wsName}`).click();
  await expect(page.getByTestId('admin-perm-close')).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('admin-perm-close')).toHaveCount(0);
});

import { test, expect } from '../fixtures';
import { apiAsAdmin, loginAdminUi } from '../helpers';

// QA-115 (follow-up of QA-71): Manage Permissions never explains Viewer / Editor / Owner.
test('QA-115: Manage Permissions dialog explains the roles', async ({ page }) => {
  const wsName = `Role Help WS ${Date.now()}`;
  const admin = await apiAsAdmin();
  await admin.post('/api/workspaces', { data: { name: wsName } });
  await admin.dispose();

  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await page.getByTestId('admin-tab-workspaces').click();
  await page.getByTestId(`admin-manage-permissions-${wsName}`).click();
  await expect(page.getByTestId('admin-perm-role-help')).toContainText(/Viewer.*Editor.*Owner/);
});

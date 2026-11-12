import { test, expect } from '../fixtures';
import { loginAdminUi, apiAsAdmin } from '../helpers';

async function openAdminTab(page: import('@playwright/test').Page, tab: string) {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
  await page.getByTestId(`admin-tab-${tab}`).click();
}

// QA-30: "Revoke Admin" was offered on the logged-in admin's own row (the server always refuses it).
test('QA-30: no Revoke Admin button on the signed-in admin\'s own row', async ({ page }) => {
  await openAdminTab(page, 'users');
  const me = page.locator('tr[data-testid^="user-row-"]').filter({ has: page.getByRole('cell', { name: 'admin', exact: true }) });
  await expect(me).toBeVisible();
  await expect(me.getByRole('button', { name: /Revoke Admin/ })).toHaveCount(0);
});

// QA-31: the audit log's Resource column showed a raw workspace UUID.
test('QA-31: audit log Resource shows the workspace name, not its id', async ({ page }) => {
  const name = `QA31 Workspace ${Date.now()}`;
  const api = await apiAsAdmin();
  const ws = await (await api.post('/api/workspaces', { data: { name } })).json();
  const id = ws._id || ws.id;
  expect((await api.put(`/api/workspaces/${id}`, { data: { description: 'touched' } })).ok()).toBeTruthy();

  await openAdminTab(page, 'logs');
  await page.getByTestId('audit-filter-action').fill('workspace.update');
  await page.getByTestId('audit-filter-apply').click();
  const row = page.getByTestId('audit-log-row').filter({ hasText: name });
  await expect(row.first()).toBeVisible();
  await expect(row.first()).not.toContainText(id);
});

import { test, expect } from '../fixtures';
import { registerUser, loginAdminUi, apiAsAdmin } from '../helpers';

/** QA-28: Admin > Workspaces shows "1 members" / "1 collections" for a count of 1. */
test('Admin workspaces table uses singular for a count of 1', async ({ page }) => {
  await registerUser(page, 'qa28', 'Plural User');
  await page.goto('about:blank'); // stop the app's in-flight requests so they don't 401 into fperrors
  await page.context().clearCookies();
  await loginAdminUi(page);
  await page.goto('/admin');
  await page.getByTestId('admin-tab-workspaces').click();
  await expect(page.locator('[data-testid^="admin-workspace-row-"]').first()).toBeVisible();
  const text = await page.locator('tbody').innerText();
  expect(text).toContain('1 member');
  expect(text).not.toMatch(/\b1 members\b/);
  expect(text).not.toMatch(/\b1 collections\b/);
});

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

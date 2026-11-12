import { test, expect } from '../fixtures';
import { registerUser, loginAdminUi } from '../helpers';

/** QA-28: Admin > Workspaces shows "1 members" / "1 collections" for a count of 1. */
test('Admin workspaces table uses singular for a count of 1', async ({ page }) => {
  await registerUser(page, 'qa28', 'Plural User');
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

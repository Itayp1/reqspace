import { test, expect } from '../fixtures';
import { loginAdminUi } from '../helpers';

test('Add User fields are reachable by their visible labels', async ({ page }) => {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await page.getByTestId('admin-add-user-btn').click();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Temporary Password')).toBeVisible();
});

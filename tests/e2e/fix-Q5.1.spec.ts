import { test, expect } from './fixtures';
import { loginAdminUi } from './helpers';

test.describe('Q5.1 admin workspaces table', () => {
  test('[Q5.1] the admin Workspaces table shows Owner and request-count/size columns', async ({ page }) => {
    await loginAdminUi(page);
    await page.getByTestId('admin-dashboard-link').click();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
    await page.getByTestId('admin-tab-workspaces').click();

    const headers = page.locator('thead th');
    await expect(headers.filter({ hasText: /^Owner$/ })).toHaveCount(1);
    await expect(headers.filter({ hasText: /^Size$/ })).toHaveCount(1);

    const row = page.locator('tr[data-testid^="admin-workspace-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/\d+ requests/);
    // Owner cell (2nd column) is populated with a name/email, not left empty.
    await expect(row.locator('td').nth(1)).not.toHaveText('');
  });
});

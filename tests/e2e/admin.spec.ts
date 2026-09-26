import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD } from './global-setup';

test.describe('Admin Features', () => {
  test('Admin login and dashboard', async ({ page }) => {
    // 1. Go to login page
    await page.goto('/login');

    // 2. Login as admin. globalSetup already walks the seeded admin/admin
    // superadmin through its forced first-login password change once, before
    // any spec runs, so this is the post-change password — not the seed.
    await page.fill('[data-testid="login-email"]', 'admin');
    await page.fill('[data-testid="login-password"]', ADMIN_PASSWORD);
    await page.click('[data-testid="login-submit"]');

    // Defensive fallback: handle a forced password change if it still
    // appears (e.g. globalSetup's own login attempt failed for some reason).
    const newPasswordInput = page.locator('[data-testid="new-password-input"]');
    if (await newPasswordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newPasswordInput.fill(ADMIN_PASSWORD);
      await page.fill('[data-testid="confirm-password-input"]', ADMIN_PASSWORD);
      await page.click('[data-testid="change-password-submit"]');
    }

    // 3. Navigate to Admin Dashboard
    await page.click('[data-testid="admin-dashboard-link"]');

    // 4. Verify Admin Dashboard loaded
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

    // 5. Verify Users tab
    await expect(page.getByTestId('user-row-admin')).toBeVisible();

    // 6. Go to Settings tab
    await page.click('[data-testid="admin-tab-settings"]');
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();
  });
});

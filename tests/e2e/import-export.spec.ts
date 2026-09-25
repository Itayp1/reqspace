import { test, expect } from '@playwright/test';

test.describe('Import / Export', () => {
  test('should navigate to AdminPage and verify import/export buttons', async ({ page }) => {
    // Register unique user
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'admin' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');

    await page.waitForSelector('[data-testid="workspace-select"]');

    // Navigate to Admin Page
    const adminLink = page.getByTestId('admin-dashboard-link');
    await adminLink.waitFor({ state: 'visible' });
    await adminLink.click();

    // Go to Settings tab in Admin Dashboard
    const settingsTab = page.getByTestId('admin-tab-settings');
    await settingsTab.waitFor({ state: 'visible' });
    await settingsTab.click();

    // Verify export button
    const exportBtn = page.getByTestId('export-data-btn');
    await expect(exportBtn).toBeVisible();

    // Verify import input
    const importInput = page.getByTestId('import-data-input');
    await expect(importInput).toBeAttached();
  });
});

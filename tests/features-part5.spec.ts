import { BASE } from './helpers/adminAuth';
import { test, expect } from '@playwright/test';

test.describe('Environment Tabs & Common Variables', () => {
  test('should open environment in a tab', async ({ page }) => {
    const suffix = Math.floor(Math.random() * 1000000);

    // 1. Go to app and register/login
    await page.goto(`${BASE}/`);
    try {
      await expect(page.locator('text=Login to Reqspace')).toBeVisible({ timeout: 3000 });
      await page.locator('text=Register').click();
      await page.fill('input[type="text"]', `Test User ${suffix}`);
      await page.fill('input[placeholder="admin or test@example.com"]', `test${suffix}@test.com`);
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
    } catch {
      // Already logged in
    }
    await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible({ timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // 2. Click the Environments tab in the sidebar
    await page.getByRole('button', { name: /envs/i }).click();

    // 3. Click Globals (Common)
    await page.getByText('Globals (Common)').click();

    // 4. Verify a tab opens for Globals
    const tab = page.locator('.bg-white', { hasText: 'Globals (Common)' });
    await expect(tab).toBeVisible();

    // 5. Create a new environment (goes through a native prompt() dialog)
    page.once('dialog', dialog => dialog.accept('New Environment'));
    await page.getByTitle('New Environment').click();
    await page.waitForTimeout(500); // Wait for tab to appear

    // 6. Rename the environment in the editor
    const nameInput = page.locator('input.text-xl');
    await nameInput.fill('My Production Env');
    await page.getByRole('button', { name: 'Save' }).click();

    // 7. Verify the sidebar updated
    await expect(page.locator('.truncate', { hasText: 'My Production Env' }).first()).toBeVisible();
  });
});

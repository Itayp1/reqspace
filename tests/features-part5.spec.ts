import { test, expect } from '@playwright/test';

test.describe('Environment Tabs & Common Variables', () => {
  test('should open environment in a tab', async ({ page }) => {
    // 1. Go to app
    await page.goto('http://localhost:3005');
    await page.waitForLoadState('networkidle');

    // 2. Click the Environments tab in the sidebar
    await page.getByRole('button', { name: /envs/i }).click();

    // 3. Click Globals (Common)
    await page.getByText('Globals (Common)').click();

    // 4. Verify a tab opens for Globals
    const tab = page.locator('.bg-white', { hasText: 'Globals (Common)' });
    await expect(tab).toBeVisible();

    // 5. Create a new environment
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

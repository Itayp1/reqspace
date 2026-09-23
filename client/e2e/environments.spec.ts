import { test, expect } from '@playwright/test';

test.describe('Environment Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    const uniqueEmail = `envtest${Date.now()}@example.com`;
    await page.fill('input[type="text"]', 'Env User');
    await page.fill('input[placeholder="admin or test@example.com"]', uniqueEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('Create, edit, and delete an environment', async ({ page }) => {
    // Open the Envs tab in the sidebar
    await page.getByRole('button', { name: /^envs$/i }).click();

    // Creating an environment goes through a native prompt() dialog, and it
    // auto-opens as a tab in the editor.
    page.once('dialog', dialog => dialog.accept('Staging Env'));
    await page.getByTitle('New Environment').click();
    const envRow = page.locator('div', { hasText: /^Staging Env$/ }).first();
    await expect(envRow).toBeVisible();

    // Add a variable in the environment editor tab and save
    await page.locator('text=+ Add a new variable').click();
    await page.locator('input[placeholder="New key"]').fill('API_URL');
    await page.locator('input[placeholder="Initial value"]').fill('https://staging.api.com');
    await page.getByRole('button', { name: 'Save' }).click();

    // Delete via the row's right-click context menu (native confirm() dialog)
    page.once('dialog', dialog => dialog.accept());
    await envRow.click({ button: 'right' });
    await page.getByText('Delete', { exact: true }).click();

    await expect(page.locator('div', { hasText: /^Staging Env$/ })).toHaveCount(0);
  });
});

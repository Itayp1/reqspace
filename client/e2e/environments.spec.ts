import { test, expect } from '@playwright/test';

test.describe('Environment Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    const uniqueEmail = `envtest${Date.now()}@example.com`;
    await page.fill('input[type="text"]', 'Env User');
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('Create, edit, and delete an environment', async ({ page }) => {
    await page.click('button[title="Manage Environments"]');
    await expect(page.locator('h2:has-text("Manage Environments")')).toBeVisible();

    await page.locator('.fixed button:has(svg.lucide-plus)').first().click();
    
    const nameInput = page.locator('input[value="New Environment"]');
    await nameInput.fill('Staging Env');

    const keyInput = page.locator('input[placeholder="New key"]');
    await keyInput.fill('API_URL');
    
    const valueInput = page.locator('input[placeholder="Initial value"]');
    await valueInput.fill('https://staging.api.com');
    
    await page.click('button:has-text("Save")');
    
    // Close the modal by clicking the X button (or clicking outside, but let's click X)
    await page.click('button:has(svg.lucide-x)');
    
    await expect(page.locator('h2:has-text("Manage Environments")')).not.toBeVisible();
    
    // Open modal again to verify it was saved
    await page.click('button[title="Manage Environments"]');
    await expect(page.locator('.fixed :text("Staging Env")').first()).toBeVisible();
    
    const envItem = page.locator('.fixed div.group', { hasText: 'Staging Env' }).first();
    await envItem.hover();
    await envItem.locator('button.text-red-500').click();
    
    await expect(page.locator('.fixed :text("Staging Env")')).not.toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Features Part 1: Environments, History, Settings', () => {
  const suffix = Date.now().toString().slice(-5);
  
  test.beforeEach(async ({ page }) => {
    // Navigate and register
    await page.goto('http://localhost:3005/');
    try {
      await expect(page.locator('text=Login to Postman Web')).toBeVisible({ timeout: 3000 });
      await page.locator('text=Register').click();
      await page.fill('input[type="text"]', `Test User ${suffix}`);
      await page.fill('input[type="email"]', `test${suffix}@test.com`);
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
    } catch {
      // Already logged in
    }
    await expect(page.locator('text=Postman Web').first()).toBeVisible({ timeout: 5000 });
  });

  test('Environment Duplication', async ({ page }) => {
    // Open environment manager
    await page.locator('button[title="Manage Environments"]').click();
    await expect(page.locator('text=Environment Manager')).toBeVisible();

    // Create a new environment
    await page.locator('text=New Environment').click();
    const nameInput = page.locator('input[type="text"]').last();
    await nameInput.fill('My Env');
    await page.locator('button:has-text("Save")').click();

    // Hover over it to reveal duplicate button
    const envItem = page.locator('div:has-text("My Env")').last();
    await envItem.hover();
    
    // Click duplicate (Copy icon)
    await envItem.locator('button[title="Duplicate"]').click();

    // Verify duplicated environment exists
    await expect(page.locator('text=My Env Copy').first()).toBeVisible();
    await page.locator('button[title="Close"]').click();
  });

  test('History Search', async ({ page }) => {
    // Send a request to populate history
    await page.fill('input[placeholder="Enter request URL"]', 'https://httpbin.org/get');
    await page.click('button:has-text("Send")');
    await expect(page.locator('text=200 OK')).toBeVisible({ timeout: 10000 });

    // Open History tab
    await page.locator('button:has-text("History")').click();
    
    // Search history
    await page.fill('input[placeholder="Search history..."]', 'httpbin');
    
    // Check if result is there
    await expect(page.locator('text=https://httpbin.org/get').first()).toBeVisible();

    // Search something else
    await page.fill('input[placeholder="Search history..."]', 'notfound.xyz');
    await expect(page.locator('text=No history found.')).toBeVisible();
  });

  test('Request Settings', async ({ page }) => {
    // Click Settings tab
    await page.locator('button:has-text("Settings")').click();
    
    // Check if toggles exist
    await expect(page.locator('text=Follow HTTP Redirects')).toBeVisible();
    await expect(page.locator('text=Verify SSL Certificates')).toBeVisible();
    await expect(page.locator('text=Send no-cache header')).toBeVisible();

    // Toggle one of them
    const verifySslCheckbox = page.locator('text=Verify SSL Certificates').locator('xpath=following-sibling::label/input');
    // Checkboxes are hidden, we click the label/peer
    await page.locator('label').filter({ hasText: 'Verify SSL' }).click(); // Depending on exact DOM structure this might need tuning.
  });
});

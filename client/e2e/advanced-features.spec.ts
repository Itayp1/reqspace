import { test, expect } from '@playwright/test';

test.describe('More Advanced Features E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    const uniqueEmail = `moreadv${Date.now()}@example.com`;
    await page.fill('input[type="text"]', 'Adv User');
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page.locator('text=Collections').first()).toBeVisible();
  });

  test('Features: Settings (Proxy), Comments, Load Test, cURL Import', async ({ page }) => {
    // 1. Settings -> Proxy
    await page.click('button[title="General Settings"]');
    await expect(page.locator('h2:has-text("Global Settings")')).toBeVisible();
    await expect(page.locator('text=Local Proxy Configuration')).toBeVisible();
    await page.click('input#proxyEnabled');
    await expect(page.locator('input[placeholder="http://127.0.0.1:8080"]')).toBeVisible();
    await page.locator('div.fixed.inset-0').locator('button:has(.lucide-x)').click();

    // 2. Import from cURL
    await page.click('button[title="Import"]');
    await page.click('button:has-text("cURL")');
    const curlCommand = `curl -X POST https://example.com/api -H "Content-Type: application/json" -d '{"name": "test"}'`;
    await page.fill('textarea', curlCommand);
    await page.click('div.fixed.inset-0 button:has-text("Import")');
    await expect(page.locator('h2:has-text("Import")')).not.toBeVisible({ timeout: 10000 });

    // Ensure the imported request opens in a tab
    await expect(page.locator('input[value="https://example.com/api"]')).toBeVisible({ timeout: 10000 });
    
    // 3. Comments (Thread)
    await page.click('button:has-text("Comments")');
    await expect(page.locator('p:has-text("No comments yet")')).toBeVisible();
    await page.fill('input[placeholder="Add a comment..."]', 'This is a test comment');
    await page.click('button:has(.lucide-send)');
    await expect(page.locator('p:has-text("This is a test comment")')).toBeVisible();

    // 4. Load Testing Modal
    await page.click('button[title="Load Test"]');
    await expect(page.locator('h2:has-text("Load Test")')).toBeVisible();
    await expect(page.locator('text=Virtual Users (VUs)')).toBeVisible();
    await page.click('div.fixed.inset-0 button:has(.lucide-x)');
  });

  test('Features: Activity, Global Search, Shortcuts', async ({ page }) => {
    // Open Global Search
    await page.keyboard.press('Control+k');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    await page.keyboard.press('Escape');

    // Open Workspace Settings for Activity
    await page.locator('.lucide-settings').last().click();
    await expect(page.locator('text=Activity / Changelog')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

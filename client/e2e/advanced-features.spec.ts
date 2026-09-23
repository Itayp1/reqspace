import { test, expect } from '@playwright/test';

test.describe('More Advanced Features E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    const uniqueEmail = `moreadv${Date.now()}@example.com`;
    await page.fill('input[type="text"]', 'Adv User');
    await page.fill('input[placeholder="admin or test@example.com"]', uniqueEmail);
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

    // A collection must exist before a request can be saved into one
    // (Save Request only lists existing collections, it can't create one)
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Imported Collection');
    await page.click('button:has-text("Save")');

    // 2. Import from cURL (this only parses — the request isn't persisted
    // until saved, so it has no _id yet and can't take comments)
    await page.click('button[title="Import"]');
    await page.click('button:has-text("cURL")');
    const curlCommand = `curl -X POST https://example.com/api -H "Content-Type: application/json" -d '{"name": "test"}'`;
    await page.fill('textarea[placeholder*="curl -X GET"]', curlCommand);
    await page.click('div.fixed.inset-0 button:has-text("Import")');
    await expect(page.locator('h2:has-text("Import")')).not.toBeVisible({ timeout: 10000 });

    // Ensure the imported request opens in a tab
    await expect(page.locator('input[value="https://example.com/api"]')).toBeVisible({ timeout: 10000 });

    // Save it into the collection created above so it has a persisted _id
    await page.getByTitle('Save Request').click();
    await page.fill('input[placeholder="Request Name"]', 'Imported cURL Request');
    await page.click('text=Imported Collection');
    // Scope to the modal — the URL bar's own "Save Request" button behind
    // the overlay also matches a bare :has-text("Save") locator.
    await page.locator('div.fixed.inset-0 button[type="submit"]').click();

    // 3. Comments (Thread)
    await page.click('button:has-text("Comments")');
    await expect(page.locator('p:has-text("No comments yet")')).toBeVisible();
    await page.fill('input[placeholder="Add a comment..."]', 'This is a test comment');
    await page.keyboard.press('Enter');
    await expect(page.locator('p:has-text("This is a test comment")')).toBeVisible();

    // 4. Load Testing Modal
    await page.click('button[title="Load Test"]');
    await expect(page.locator('text=Load Tester')).toBeVisible();
    await expect(page.locator('label:has-text("Iterations")')).toBeVisible();
    await expect(page.locator('label:has-text("Concurrency")')).toBeVisible();
    await page.click('button:has-text("Close")');
  });

  test('Features: Activity, Global Search, Shortcuts', async ({ page }) => {
    // Open Global Search
    await page.keyboard.press('Control+k');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    await page.keyboard.press('Escape');

    // Open Workspace Settings for Activity
    await page.getByTitle('Workspace Settings').click();
    await page.click('button:has-text("Activity / Changelog")');
    await expect(page.locator('text=Activity / Changelog')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

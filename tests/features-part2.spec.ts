import { BASE } from './helpers/adminAuth';
import { test, expect } from '@playwright/test';

test.describe('Features Part 2: Import & Export', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and register
    const testSuffix = Math.floor(Math.random() * 1000000);
    await page.goto(`${BASE}/`);
    try {
      await expect(page.locator('text=Login to Reqspace')).toBeVisible({ timeout: 3000 });
      await page.locator('text=Register').click();
      await page.fill('input[type="text"]', `Test User ${testSuffix}`);
      await page.fill('input[placeholder="admin or test@example.com"]', `test${testSuffix}@test.com`);
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
    } catch {
      // Already logged in
    }
    await expect(page.locator('button[title="Import"]')).toBeVisible({ timeout: 5000 });
  });

  
  test('Inline Comments', async ({ page }) => {
    // Need a request to comment on.
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'My Collection');
    await page.click('button:has-text("Save")');

    // Hover collection and click action menu
    await page.hover('text=My Collection');
    // Open action menu (often ... or context menu)
    await page.click('text=My Collection', { button: 'right' });
    await page.click('text=New Request');
    await page.fill('input[placeholder="Request name:"]', 'Comment Test Request');
    await page.click('button:has-text("Save")');
    
    // Open the request by clicking on it
    await page.click('text=Comment Test Request');
    
    // Open comments tab
    await page.click('button:has-text("Comments")');
    await expect(page.locator('text=No comments yet')).toBeVisible();

    // Add a comment
    await page.fill('input[placeholder="Add a comment..."]', 'This is a test comment');
    await page.keyboard.press('Enter');

    // Wait for comment to appear
    await expect(page.locator('text=This is a test comment')).toBeVisible({ timeout: 5000 });

    // Delete comment
    await page.hover('text=This is a test comment');
    await page.locator('button[title="Delete comment"]').click();
    await expect(page.locator('text=No comments yet')).toBeVisible({ timeout: 5000 });
  });

  test('Raw HTTP Import', async ({ page }) => {
    // Open Import Modal
    await page.locator('button[title="Import"]').click();
    await expect(page.locator('h2:has-text("Import")')).toBeVisible();

    // Click Raw HTTP tab
    await page.locator('button:has-text("Raw HTTP")').click();

    const rawHttp = `POST /api/v1/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer mytoken123

{"name": "Alice"}`;

    await page.fill('textarea[placeholder*="HTTP/1.1"]', rawHttp);
    await page.click('button:has-text("Import")');

    await expect(page.locator('text=POST /api/v1/users')).toBeVisible();
  });

  test('ContextMenu (Right Click)', async ({ page }) => {
    // Since we need a collection, we can just create one first.
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'My Collection');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=My Collection')).toBeVisible();

    // Right click on the collection
    await page.click('text=My Collection', { button: 'right' });

    // Expect context menu options
    await expect(page.locator('text=New Request')).toBeVisible();
    await expect(page.locator('text=New Folder')).toBeVisible();
    await expect(page.locator('text=Delete')).toBeVisible();
  });

  test('CodeGen (cURL Export)', async ({ page }) => {
    // Need an open request tab for the URL bar (and its Code Snippet button) to render
    await page.getByRole('button', { name: 'Create a Request' }).click();

    // Open CodeGen
    await page.locator('button[title="Code Snippet"]').click();
    await expect(page.locator('text=Generate Code')).toBeVisible();

    // Click copy
    await page.click('button:has-text("Copy")');
    await expect(page.locator('text=Copied!')).toBeVisible();
  });
});

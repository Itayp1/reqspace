import { test, expect } from '@playwright/test';

test.describe('Collection Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    const uniqueEmail = `colltest${Date.now()}@example.com`;
    await page.fill('input[type="text"]', 'Coll User');
    await page.fill('input[placeholder="admin or test@example.com"]', uniqueEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page.locator('text=Collections').first()).toBeVisible();
  });

  test('Create Collection, Folder, and Request', async ({ page }) => {
    // 1. Create Collection
    await page.click('button[title="New Collection"]');
    await page.fill('input[placeholder="Enter collection name:"]', 'Test API Collection');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Test API Collection').first()).toBeVisible();

    // 2. Create Folder
    const collNode = page.locator('.group', { hasText: 'Test API Collection' }).first();
    await collNode.hover();
    await collNode.locator('.lucide-more-vertical').first().click(); // Open menu
    await page.locator('text=New Folder').click();
    await page.fill('input[placeholder="Folder name:"]', 'Auth Endpoints');
    await page.click('button:has-text("Save")');
    
    // Expand the collection to see the folder
    await collNode.locator('.lucide-chevron-right').click();
    await expect(page.locator('text=Auth Endpoints').first()).toBeVisible();

    // 3. Create Request inside Folder
    const folderNode = page.locator('.group', { hasText: 'Auth Endpoints' }).first();
    await folderNode.hover();
    await folderNode.locator('.lucide-more-vertical').first().click();
    await page.locator('text=New Request').click();
    await page.fill('input[placeholder="Request name:"]', 'Login Request');
    await page.click('button:has-text("Save")');
    
    // Expand the folder to see the request
    await folderNode.locator('.lucide-chevron-right').click();
    
    // Verify the request is created
    await expect(page.locator('text=Login Request').first()).toBeVisible();
  });
});

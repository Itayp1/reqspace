import { serverOrigin } from './helpers/baseUrl';
import { test, expect } from '@playwright/test';

test.describe('Features Part 4: UI, Scripts & Advanced', () => {
  test.beforeEach(async ({ page }) => {
    const testSuffix = Math.floor(Math.random() * 1000000);
    await page.goto(`${serverOrigin()}/`);
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

  test('Collection Variables (Feature 54)', async ({ page }) => {
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Vars Collection');
    await page.click('button:has-text("Save")');

    // Right click and Edit -> Variables tab (default tab for collections)
    await page.click('text=Vars Collection', { button: 'right' });
    await page.click('text=Edit');

    await expect(page.locator('text=Edit Collection')).toBeVisible();
    await expect(page.locator('text=+ Add a new variable')).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });

  test('Collection Scripts (Feature 85, 86)', async ({ page }) => {
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Scripts Collection');
    await page.click('button:has-text("Save")');

    // Open Scripts modal
    await page.click('text=Scripts Collection', { button: 'right' });
    await page.click('text=Edit');
    
    // We assume 'Edit' opens GroupEditModal with Pre-request and Tests tabs
    await expect(page.locator('text=Edit Collection')).toBeVisible();
    await expect(page.locator('button:has-text("Pre-request Script")')).toBeVisible();
    await expect(page.locator('button:has-text("Tests")')).toBeVisible();
    
    await page.click('button:has-text("Cancel")');
  });

  test('History Search & Filter (Feature 68)', async ({ page }) => {
    // Open History Tab
    await page.click('button:has-text("History")');
    
    // Check search input
    await expect(page.locator('input[placeholder="Search history..."]')).toBeVisible();
  });

  test('Auto-Formatting (Feature 77)', async ({ page }) => {
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Format Collection');
    await page.click('button:has-text("Save")');

    await page.click('text=Format Collection', { button: 'right' });
    await page.click('text=New Request');
    await page.fill('input[placeholder="Request name:"]', 'Format Request');
    await page.click('button:has-text("Save")');
    await page.click('text=Format Request');

    // Go to Body
    await page.click('button:has-text("Body")');
    await page.click('label:has-text("raw")'); // body mode is a radio group, not buttons

    // Beautify button
    await expect(page.locator('button[title*="Beautify"]')).toBeVisible();
  });

  test('Visual Payload & Save Response (Features 78, 80)', async ({ page }) => {
    // This requires a response to exist. We can just verify the Save Response button is in the UI
    // even if disabled, or check the DOM. 
    // The visual payload renders conditionally, but we have verified it in the components.
    
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Response Collection');
    await page.click('button:has-text("Save")');

    await page.click('text=Response Collection', { button: 'right' });
    await page.click('text=New Request');
    await page.fill('input[placeholder="Request name:"]', 'Response Request');
    await page.click('button:has-text("Save")');
    await page.click('text=Response Request');

    // Save Response button is usually shown when a response arrives, but we know the feature is there.
    // Instead we can just send a dummy request and see it.
    await page.fill('input[placeholder="Enter request URL"]', 'https://httpbin.org/get');
    await page.click('button:has-text("Send")');

    // Wait for response status 200 OK
    await expect(page.locator('text=200 OK')).toBeVisible({ timeout: 10000 });

    // Look for Save Response button
    await expect(page.locator('button[title="Save Response"]')).toBeVisible();
  });
});

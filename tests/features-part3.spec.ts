import { test, expect } from '@playwright/test';

test.describe('Features Part 3: Advanced & Collaboration', () => {
  test.beforeEach(async ({ page }) => {
    const testSuffix = Math.floor(Math.random() * 1000000);
    await page.goto('http://localhost:3005/');
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

  test('Load Testing (Feature 18)', async ({ page }) => {
    // Open a request
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Load Test Collection');
    await page.click('button:has-text("Save")');

    await page.hover('text=Load Test Collection');
    await page.click('text=Load Test Collection', { button: 'right' });
    await page.click('text=New Request');
    await page.fill('input[placeholder="Request name:"]', 'Load Request');
    await page.click('button:has-text("Save")');
    
    await page.click('text=Load Request');

    // Click Load Test button
    await page.locator('button[title="Load Test"]').click();
    await expect(page.locator('text=Load Tester')).toBeVisible();

    // Verify fields
    await expect(page.locator('label:has-text("Iterations")')).toBeVisible();
    await expect(page.locator('label:has-text("Concurrency")')).toBeVisible();

    // Close
    await page.click('button:has-text("Close")');
    await expect(page.locator('text=Load Tester')).not.toBeVisible();
  });

  test('Workspace Settings: Public, Proxy, SSL, Redirects (Features 26, 44, 46, 48)', async ({ page }) => {
    // Open Workspace Settings
    await page.locator('button[title="Workspace Settings"]').click();
    await expect(page.locator('text=Workspace Settings')).toBeVisible();

    // General tab -> Public Workspace
    await expect(page.locator('label:has-text("Public Workspace")')).toBeVisible();
    // Close (icon-only X button next to the heading, no text label)
    await page.locator('h2:has-text("Workspace Settings")').locator('xpath=following-sibling::button').click();

    // Proxy / SSL / Redirects are General (per-user) Settings, not per-workspace
    await page.getByTitle('General Settings').click();
    await expect(page.locator('label:has-text("Enable Local Proxy")')).toBeVisible();
    await expect(page.locator('label:has-text("Verify SSL Certificates")')).toBeVisible();
    await expect(page.locator('label:has-text("Follow Redirects")')).toBeVisible();
  });

  test('Forking Collections (Feature 29)', async ({ page }) => {
    // Create collection
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Collection To Fork');
    await page.click('button:has-text("Save")');

    // Open context menu and copy
    await page.click('text=Collection To Fork', { button: 'right' });
    await page.click('text=Copy to Workspace');
    
    await expect(page.locator('text=Copy Collection')).toBeVisible();
    await page.click('button:has-text("Copy")');
  });

  test('Saved Examples (Feature 42)', async ({ page }) => {
    // Roadmap Feature 42 ("Saved Examples") has no corresponding UI yet — no
    // "Save as Example" control exists anywhere in the response viewer.
    test.fixme(true, 'Saved Examples feature (roadmap #42) is not implemented in the client yet');

    // Create collection and request
    await page.locator('button[title="New Collection"]').click();
    await page.fill('input[placeholder="Enter collection name:"]', 'Example Collection');
    await page.click('button:has-text("Save")');

    await page.click('text=Example Collection', { button: 'right' });
    await page.click('text=New Request');
    await page.fill('input[placeholder="Request name:"]', 'Example Request');
    await page.click('button:has-text("Save")');

    await page.click('text=Example Request');

    // Once implemented, assert the "Save as Example" control appears after a response is received.
  });

  test('Environment Duplication (Feature 52)', async ({ page }) => {
    // Open the Envs tab in the sidebar
    await page.getByRole('button', { name: /^envs$/i }).click();

    // Creating an environment goes through a native prompt() dialog, and the
    // new environment auto-opens as a tab — so scope to the sidebar (first
    // match in DOM order), not the tab bar, which would also match by text.
    page.once('dialog', dialog => dialog.accept('Env To Duplicate'));
    await page.getByTitle('New Environment').click();
    const envItem = page.locator('div', { hasText: /^Env To Duplicate$/ }).first();
    await expect(envItem).toBeVisible();

    // Duplicate via the row's right-click context menu
    await envItem.click({ button: 'right' });
    await page.getByText('Duplicate', { exact: true }).click();

    // Server names duplicates "<name> (copy)"
    await expect(page.locator('text=Env To Duplicate (copy)').first()).toBeVisible();
  });
});

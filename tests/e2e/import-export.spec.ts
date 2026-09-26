import { test, expect } from '@playwright/test';

test.describe('Import / Export', () => {
  test('should export workspace data and import it successfully', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'admin' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');

    await page.waitForSelector('[data-testid="workspace-select"]');
    
    // Create a new collection to export
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill('Export Collection ' + ts);
    await page.getByTestId('prompt-submit').click();
    
    // Create a request in it
    await page.getByTestId('action-menu-btn').first().click();
    await page.getByTestId('action-menu-add-request').click();
    await page.getByTestId('request-name-input').fill('Export Request');
    await page.getByTestId('request-url-input').fill('https://example.com');
    await page.getByTestId('save-request-btn').click();

    // Navigate to Admin Page
    const adminLink = page.getByTestId('admin-dashboard-link');
    await adminLink.waitFor({ state: 'visible' });
    await adminLink.click();

    // Go to Settings tab in Admin Dashboard
    const settingsTab = page.getByTestId('admin-tab-settings');
    await settingsTab.waitFor({ state: 'visible' });
    await settingsTab.click();

    // Export Data
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-data-btn').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    const fs = require('fs');
    const dumpData = JSON.parse(fs.readFileSync(path, 'utf8'));
    expect(dumpData.collections).toBeDefined();
    expect(dumpData.collections.length).toBeGreaterThan(0);
    expect(dumpData.collections[0].name).toBe('Export Collection ' + ts);
    expect(dumpData.requests.length).toBeGreaterThan(0);

    // Modify dump data to import
    dumpData.collections[0].name = 'Imported Collection ' + ts;
    const importPath = path + '_import.json';
    fs.writeFileSync(importPath, JSON.stringify(dumpData));

    // Import Data
    page.on('dialog', dialog => dialog.accept());
    
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/admin/import/') && req.method() === 'POST'),
      page.getByTestId('import-data-input').setInputFiles(importPath)
    ]);
    
    // Wait for the import request to finish
    const response = await request.response();
    expect(response?.status()).toBe(200);
    
    // Wait for toast
    await expect(page.locator('text=Import successful! Reloading...')).toBeVisible();
    
    // Give it a moment to reload
    await page.waitForTimeout(2000);
    
    // Go back to workspace to verify
    await page.goto('/');
    await page.waitForSelector('[data-testid="workspace-select"]');
    
    // Check if imported collection exists
    await expect(page.locator(`text=Imported Collection ${ts}`)).toBeVisible();
  });
});

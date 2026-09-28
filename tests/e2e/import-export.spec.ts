import { test, expect } from '@playwright/test';

test.describe('Import / Export', () => {
  test('should export workspace data and import it successfully', async ({ page }) => {
    const ts = Date.now();
    // The Admin dashboard link only renders for a superadmin — a freshly
    // registered user can't reach it, so log in as the seeded admin instead.
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // A dedicated workspace keeps the export scoped to exactly what this
    // test creates — the admin account accumulates workspaces/collections
    // across the whole suite, so collections[0] wouldn't otherwise be safe
    // to assume is this test's own collection.
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(`Import Export WS ${ts}`);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('workspace-select')).toContainText(`Import Export WS ${ts}`);

    // Create a new collection to export (custom in-app modal, not a native dialog)
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill('Export Collection ' + ts);
    await page.getByTestId('prompt-submit').click();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-Export Collection ${ts}`) });
    await expect(colNode).toBeVisible();

    // Create a request in it
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Export Request');
    await page.getByTestId('prompt-submit').click();

    // Open it and set its URL, then save
    await page.getByTestId('node-Export Request').click();
    await page.getByTestId('request-url-input').fill('https://example.com');
    await page.getByTestId('request-save-btn').click();

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

    // Import Data. The confirmation is a custom in-app modal (ConfirmModal),
    // not a native dialog — it opens only after the file's been read, and
    // the POST only fires once the user confirms it.
    await page.getByTestId('import-data-input').setInputFiles(importPath);
    await expect(page.locator('#confirm-modal-description')).toContainText('This will insert all dumped');

    const importResponse = page.waitForResponse(resp =>
      resp.url().includes('/api/admin/import/') && resp.request().method() === 'POST'
    );
    await page.getByTestId('confirm-btn').click();
    const response = await importResponse;
    expect(response.status()).toBe(200);
    
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

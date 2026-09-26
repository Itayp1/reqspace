import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD } from './global-setup';

test.describe('Collection Operations', () => {
  // Run serially to reuse state
  test.describe.configure({ mode: 'serial' });

  test('Login and create workspace', async ({ page }) => {
    await page.goto('/login');
    // We assume data-testids exist
    await page.getByTestId('login-email').fill('admin');
    // globalSetup already walks the seeded admin through its forced
    // first-login password change, so this is the post-change password.
    await page.getByTestId('login-password').fill(ADMIN_PASSWORD);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/.*\/$/);
    
    // Create Workspace
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill('Test Workspace');
    await page.getByTestId('prompt-submit').click();

    // Check if workspace is selected (we can assert that it appears)
    await expect(page.getByTestId('workspace-select')).toContainText('Test Workspace');
  });

  test('Create a collection', async ({ page }) => {
    await page.goto('/');

    // Click on New Collection
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible()) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    
    await page.getByTestId('prompt-input').fill('Test Collection');
    await page.getByTestId('prompt-submit').click();

    // Verify it exists
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
  });

  test('Create a folder inside collection', async ({ page }) => {
    await page.goto('/');

    // Open context menu for collection
    await page.getByTestId('node-Test Collection').hover();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection') });
    await colNode.getByTestId('action-menu-btn').click();

    await page.getByTestId('action-menu-new-folder').click();
    
    await page.getByTestId('prompt-input').fill('Test Folder');
    await page.getByTestId('prompt-submit').click();

    await expect(page.getByTestId('node-Test Folder')).toBeVisible();
  });

  test('Rename collection and delete folder', async ({ page }) => {
    await page.goto('/');

    // Rename Collection
    await page.getByTestId('node-Test Collection').hover();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection') });
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-rename').click();

    await page.getByTestId('inline-rename-input').fill('Renamed Collection');
    await page.keyboard.press('Enter');
    
    await expect(page.getByTestId('node-Renamed Collection')).toBeVisible();

    // Delete folder
    await page.getByTestId('node-Test Folder').hover();
    const folderNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Folder') });
    await folderNode.getByTestId('action-menu-btn').click();
    
    await page.getByTestId('action-menu-delete').click();
    await page.getByTestId('confirm-btn').click(); 

    await expect(page.getByTestId('node-Test Folder')).not.toBeVisible();
  });
});

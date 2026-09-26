import { test, expect } from '@playwright/test';

test.describe('Collection Operations', () => {
  // Run serially to reuse state
  test.describe.configure({ mode: 'serial' });

  test('Login and create workspace', async ({ page }) => {
    await page.goto('/login');
    // We assume data-testids exist
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/.*\/$/);
    
    // Create Workspace
    page.on('dialog', async (dialog) => {
      await dialog.accept('Test Workspace');
    });
    
    await page.getByTestId('new-workspace-btn').click();
    
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

  test('duplicate, move between folders, reorder survives reload', async ({ page }) => {
    await page.goto('/');

    // 1. Create a new collection for this specific test
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible()) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    
    await page.getByTestId('prompt-input').fill('Sort Collection');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Sort Collection')).toBeVisible();

    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Sort Collection') });
    
    // Create Folder A
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Folder A');
    await page.getByTestId('prompt-submit').click();

    // Create Folder B
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Folder B');
    await page.getByTestId('prompt-submit').click();

    // Create Request Z in Folder A
    const folderANode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Folder A') });
    await folderANode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Request Z');
    await page.getByTestId('prompt-submit').click();

    // Create Request A in Folder A
    await folderANode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Request A');
    await page.getByTestId('prompt-submit').click();

    // Duplicate Request Z
    const reqZNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Request Z') });
    await reqZNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-duplicate').click();
    await expect(page.getByTestId('node-Request Z (Copy)')).toBeVisible();

    // Move Request Z (Copy) to Folder B
    await page.dragAndDrop('[data-testid="node-Request Z (Copy)"]', '[data-testid="node-Folder B"]');
    
    // Expand Folder B to verify
    await page.getByTestId('node-Folder B').click();
    await expect(page.getByTestId('node-Request Z (Copy)')).toBeVisible();

    // Duplicate Collection
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-duplicate-/-fork').click();
    await expect(page.getByTestId('node-Sort Collection (Copy)')).toBeVisible();

    // Reorder Folder A (Sort A-Z)
    await folderANode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-sort-a-z').click();
    
    // Reload
    await page.reload();
    
    // Re-expand Collection and Folder A
    await page.getByTestId('node-Sort Collection').click();
    await page.getByTestId('node-Folder A').click();

    await expect(page.getByTestId('node-Request A')).toBeVisible();
    await expect(page.getByTestId('node-Request Z')).toBeVisible();

    // Verify Reorder
    const requestNames = await page.locator('[data-testid^="node-Request"]').allTextContents();
    const idxA = requestNames.indexOf('Request A');
    const idxZ = requestNames.indexOf('Request Z');
    expect(idxA).toBeLessThan(idxZ);
  });
});

import { test, expect } from '@playwright/test';

test.describe('Collection Operations', () => {
  // Run serially to reuse state
  test.describe.configure({ mode: 'serial' });

  // Unique per run: the live server accumulates workspaces/collections across
  // every spec file in the full suite, so a fixed name would collide with
  // leftovers from earlier runs/files.
  const WORKSPACE_NAME = `Test Workspace ${Date.now()}`;
  // A serial-mode retry re-runs the whole block from the first test, which
  // creates a second, identically-named workspace — selecting by label would
  // then be ambiguous. Select by id instead, captured fresh on each attempt.
  let workspaceId = '';

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('Login and create workspace', async ({ page }) => {
    // Create Workspace (custom in-app modal, not a native dialog)
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(WORKSPACE_NAME);
    await page.getByTestId('prompt-submit').click();

    // Check if workspace is selected (we can assert that it appears)
    await expect(page.getByTestId('workspace-select')).toContainText(WORKSPACE_NAME);
    workspaceId = await page.getByTestId('workspace-select').inputValue();
  });

  test('Create a collection', async ({ page }) => {
    await page.goto('/');
    // A fresh login defaults to whatever workspace is first for this admin —
    // with many workspaces accumulated across the suite that's not
    // necessarily the one this file created, so select it explicitly.
    await page.getByTestId('workspace-select').selectOption(workspaceId);

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
    await page.getByTestId('workspace-select').selectOption(workspaceId);

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
    await page.getByTestId('workspace-select').selectOption(workspaceId);

    // Rename Collection
    await page.getByTestId('node-Test Collection').hover();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection') });
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-rename').click();

    await page.getByTestId('inline-rename-input').fill('Renamed Collection');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('node-Renamed Collection')).toBeVisible();

    // A fresh page load starts every collection collapsed (open/closed state
    // isn't persisted) — expand it to reveal the folder created in the
    // previous test before trying to interact with it.
    await page.getByTestId('node-Renamed Collection').click();

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
    await page.getByTestId('workspace-select').selectOption(workspaceId);

    // This workspace already has "Renamed Collection" from a previous test,
    // but the sidebar briefly renders its empty state while collections load
    // on a fresh page — wait for that load to settle so the always-present
    // header button (not the transient empty-state one) is what gets clicked.
    await expect(page.getByTestId('node-Renamed Collection')).toBeVisible();

    // 1. Create a new collection for this specific test
    await page.getByTestId('new-collection-btn').click();

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

    // Create Request Z in Folder A. Unlike collections, a folder's
    // expanded/collapsed state isn't auto-opened when a child is added to
    // it, so it has to be expanded explicitly before its requests appear.
    const folderANode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Folder A') });
    await page.getByTestId('node-Folder A').click();
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

    // Duplicate Collection (collections are prefixed "Copy of X", unlike
    // requests/folders which are suffixed "X (Copy)")
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-duplicate-/-fork').click();
    await expect(page.getByTestId('node-Copy of Sort Collection')).toBeVisible();

    // Reorder Folder A (Sort A-Z). The click only dispatches the DOM event —
    // it doesn't wait for the async reorder to reach the server — so wait
    // for that PUT to complete before reloading, or the reload can race it
    // and come back with the pre-sort order.
    await folderANode.getByTestId('action-menu-btn').click();
    const reorderResponse = page.waitForResponse(resp =>
      resp.url().includes('/collections/reorder') && resp.request().method() === 'PUT'
    );
    await page.getByTestId('action-menu-sort-a-z').click();
    await reorderResponse;

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

import { test, expect } from '@playwright/test';

test.describe('WebSocket Advanced Sync', () => {
  test('Folder rename and Global variables sync between users', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    const timestamp = Date.now();
    const emailA = `userA_${timestamp}@example.com`;
    const emailB = `userB_${timestamp}@example.com`;
    const pass = 'password123';

    // 1. Register User B
    await pageB.goto('/register');
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(emailB);
    await pageB.getByTestId('register-password').fill(pass);
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*\/$/);
    
    // 2. Register User A
    await pageA.goto('/register');
    await pageA.getByTestId('register-name').fill('User A');
    await pageA.getByTestId('register-email').fill(emailA);
    await pageA.getByTestId('register-password').fill(pass);
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*\/$/);

    // 3. User A creates Workspace
    pageA.once('dialog', async dialog => await dialog.accept(`WS_${timestamp}`));
    await pageA.getByTestId('new-workspace-btn').click();
    await expect(pageA.getByTestId('workspace-select')).toContainText(`WS_${timestamp}`);

    // 4. User A invites User B
    await pageA.getByTestId('workspace-settings-btn').click();
    await pageA.getByTestId('workspace-members-tab').click();
    await pageA.getByTestId('user-autocomplete-input').fill(emailB);
    await pageA.getByTestId('user-autocomplete-result').first().click();
    await pageA.getByTestId('workspace-invite-btn').click();
    await expect(pageA.getByTestId('member-email').filter({ hasText: emailB })).toBeVisible();
    await pageA.getByTestId('close-workspace-modal').click();

    // 5. User B switches to the workspace
    await pageB.reload();
    await expect(pageB.getByTestId('workspace-select')).toContainText(`WS_${timestamp}`);
    await pageB.getByTestId('workspace-select').selectOption({ label: `WS_${timestamp}` });

    // 6. User A creates a Collection and Folder
    pageA.once('dialog', async dialog => await dialog.accept('Sync Collection'));
    await pageA.getByTestId('new-collection-empty-btn').click();
    await expect(pageA.getByTestId('node-Sync Collection')).toBeVisible();

    await pageA.getByTestId('node-Sync Collection').hover();
    await pageA.locator('[data-testid="node-container"]', { has: pageA.getByTestId('node-Sync Collection') }).getByTestId('action-menu-btn').click();
    pageA.once('dialog', async dialog => await dialog.accept('Sync Folder'));
    await pageA.getByTestId('action-menu-new-folder').click();
    
    await expect(pageA.getByTestId('node-Sync Folder')).toBeVisible();

    // 7. User B sees the folder
    await expect(pageB.getByTestId('node-Sync Collection')).toBeVisible({ timeout: 15000 });
    await pageB.getByTestId('node-Sync Collection').click();
    await expect(pageB.getByTestId('node-Sync Folder')).toBeVisible({ timeout: 15000 });

    // 8. User A renames the folder
    await pageA.getByTestId('node-Sync Folder').dblclick();
    await pageA.getByTestId('inline-rename-input').fill('Renamed Folder');
    await pageA.keyboard.press('Enter');

    // 9. User B sees renamed folder
    await expect(pageB.getByTestId('node-Renamed Folder')).toBeVisible({ timeout: 15000 });

    // 10. Global Variables Sync
    await pageA.getByTestId('env-globals-btn').click();
    await pageA.getByTestId('env-add-var-btn').click();
    await pageA.getByTestId('env-var-key-0').fill('GlobalKey');
    await pageA.getByTestId('env-var-val-0').fill('GlobalVal');
    await pageA.getByTestId('env-save-btn').click();

    await pageB.getByTestId('env-globals-btn').click();
    await expect(pageB.getByTestId('env-var-key-0')).toHaveValue('GlobalKey', { timeout: 15000 });
    await expect(pageB.getByTestId('env-var-val-0')).toHaveValue('GlobalVal', { timeout: 15000 });

    // Clean up
    await contextA.close();
    await contextB.close();
  });
});

import { test, expect } from '@playwright/test';

test.describe('RBAC Roles', () => {
  const timestamp = Date.now();
  const userAEmail = `user_a_${timestamp}@example.com`;
  const userBEmail = `user_b_${timestamp}@example.com`;

  test('Viewer cannot edit, Editor can edit', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // User A Register
    await pageA.goto('/register');
    await pageA.fill('[data-testid="register-name"]', 'User A');
    await pageA.fill('[data-testid="register-email"]', userAEmail);
    await pageA.fill('[data-testid="register-password"]', 'password');
    await pageA.click('[data-testid="register-submit"]');
    await expect(pageA).toHaveURL(/.*\/$/);

    // User B Register
    await pageB.goto('/register');
    await pageB.fill('[data-testid="register-name"]', 'User B');
    await pageB.fill('[data-testid="register-email"]', userBEmail);
    await pageB.fill('[data-testid="register-password"]', 'password');
    await pageB.click('[data-testid="register-submit"]');
    await expect(pageB).toHaveURL(/.*\/$/);

    // User A Creates Workspace
    const wsName = `RBAC WS ${timestamp}`;
    pageA.on('dialog', dialog => dialog.accept(wsName));
    await pageA.click('[data-testid="new-workspace-btn"]');
    await expect(pageA.locator('[data-testid="workspace-select"]')).toContainText(wsName);

    // User A creates a request to ensure there is one in the workspace
    // They are already in the new workspace
    // We just type in the URL bar and save
    await pageA.getByTestId('request-url-input').fill('https://example.com');
    await pageA.click('[data-testid="request-save-btn"]');
    // Save modal
    await pageA.fill('input[placeholder="Request Name"]', 'Test Request');
    // Need to create a collection to save request
    await pageA.click('button:has-text("Create Collection")');
    await pageA.fill('input[placeholder="New Collection Name"]', 'Col 1');
    // It creates it on enter or click? Let's assume there's a save button or just press enter
    await pageA.keyboard.press('Enter');
    await pageA.click('button:has-text("Save Request")');
    
    // User A invites User B as Viewer
    await pageA.click('[data-testid="workspace-settings-btn"]');
    await pageA.click('button:has-text("Members")');
    await pageA.fill('[data-testid="user-autocomplete-input"]', userBEmail);
    await pageA.click('[data-testid="user-autocomplete-result"]');
    await pageA.selectOption('[data-testid="workspace-invite-role"]', 'viewer');
    await pageA.click('[data-testid="workspace-invite-btn"]');
    await expect(pageA.locator('[data-testid="member-email"]', { hasText: userBEmail })).toBeVisible();
    await pageA.click('[data-testid="close-workspace-modal"]');

    // User B refreshes and switches to workspace
    await pageB.reload();
    await pageB.selectOption('[data-testid="workspace-select"]', { label: wsName });
    await expect(pageB.locator('[data-testid="workspace-select"]')).toContainText(wsName);

    // User B opens the request
    await pageB.click('text="Test Request"');
    
    // User B verifies Save button is not visible or disabled, or inputs are disabled
    await expect(pageB.locator('[data-testid="request-save-btn"]')).not.toBeVisible();

    // User A changes role to Editor
    await pageA.click('[data-testid="workspace-settings-btn"]');
    await pageA.click('button:has-text("Members")');
    // find the row with User B email and change select
    const row = pageA.locator('[data-testid="member-row"]', { has: pageA.locator(`[data-testid="member-email"]:has-text("${userBEmail}")`) });
    await row.locator('[data-testid="member-role-select"]').selectOption('editor');
    await pageA.click('[data-testid="close-workspace-modal"]');

    // User B reloads
    await pageB.reload();
    await pageB.selectOption('[data-testid="workspace-select"]', { label: wsName });
    await pageB.click('text="Test Request"');
    
    // User B should now see the Save button
    await expect(pageB.locator('[data-testid="request-save-btn"]')).toBeVisible();
  });
});

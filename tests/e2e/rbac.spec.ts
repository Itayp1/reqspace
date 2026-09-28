import { test, expect } from '@playwright/test';

test.describe('RBAC Roles', () => {
  test('Viewer cannot edit, Editor can edit', async ({ browser }) => {
    const timestamp = Date.now();
    const userAEmail = `user_a_${timestamp}@example.com`;
    const userBEmail = `user_b_${timestamp}@example.com`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // User A Register
    await pageA.goto('/register');
    await pageA.getByTestId('register-name').fill('User A');
    await pageA.getByTestId('register-email').fill(userAEmail);
    await pageA.getByTestId('register-password').fill('password123');
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*\/$/);

    // User B Register
    await pageB.goto('/register');
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(userBEmail);
    await pageB.getByTestId('register-password').fill('password123');
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*\/$/);

    // User A Creates Workspace (custom in-app modal, not a native dialog)
    const wsName = `RBAC WS ${timestamp}`;
    await pageA.getByTestId('new-workspace-btn').click();
    await pageA.getByTestId('prompt-input').fill(wsName);
    await pageA.getByTestId('prompt-submit').click();
    await expect(pageA.getByTestId('workspace-select')).toContainText(wsName);
    const workspaceId = await pageA.getByTestId('workspace-select').inputValue();

    // User A creates a collection first — the Save modal itself can't create
    // one (its "Save to..." list just says "No collections found" when
    // empty and the submit button stays disabled).
    await pageA.getByTestId('new-collection-empty-btn').click();
    await pageA.getByTestId('prompt-input').fill('Col 1');
    await pageA.getByTestId('prompt-submit').click();
    await expect(pageA.getByTestId('node-Col 1')).toBeVisible();

    // User A creates a request and saves it into that collection
    await pageA.getByTestId('new-tab-btn').click();
    await pageA.getByTestId('request-url-input').fill('https://example.com');
    await pageA.getByTestId('request-save-btn').click();
    await pageA.getByTestId('save-req-name-input').fill('Test Request');
    await pageA.getByTestId('save-req-submit-btn').click();
    await expect(pageA.getByTestId('save-req-name-input')).toBeHidden();
    // Save opens the target collection. A click on the row toggles it shut.
    await expect(pageA.getByTestId('node-Test Request')).toBeVisible();

    // User A invites User B as Viewer
    await pageA.getByTestId('workspace-settings-btn').click();
    await pageA.getByTestId('workspace-members-tab').click();
    await pageA.getByTestId('user-autocomplete-input').fill(userBEmail);
    await pageA.getByTestId('user-autocomplete-result').first().click();
    await pageA.getByTestId('workspace-invite-role').selectOption('viewer');
    await pageA.getByTestId('workspace-invite-btn').click();
    await expect(pageA.getByTestId('member-email').filter({ hasText: userBEmail })).toBeVisible();
    await pageA.getByTestId('close-workspace-modal').click();

    // User B refreshes and switches to workspace
    await pageB.reload();
    await pageB.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(pageB.getByTestId('workspace-select')).toContainText(wsName);

    // User B opens the request. A fresh page load starts every collection
    // collapsed, so it has to be expanded before its request is in the DOM.
    await expect(pageB.getByTestId('node-Col 1')).toBeVisible();
    await pageB.getByTestId('node-Col 1').click();
    await pageB.getByTestId('node-Test Request').click();

    // User B verifies Save button is not visible (viewers can't edit)
    await expect(pageB.getByTestId('request-save-btn')).not.toBeVisible();

    // User A changes role to Editor
    await pageA.getByTestId('workspace-settings-btn').click();
    await pageA.getByTestId('workspace-members-tab').click();
    const row = pageA.locator('[data-testid="member-row"]', { has: pageA.locator(`[data-testid="member-email"]:has-text("${userBEmail}")`) });
    const roleUpdated = pageA.waitForResponse(
      (r) => r.url().includes('/members/') && r.request().method() === 'PUT' && r.ok(),
    );
    await row.locator('[data-testid="member-role-select"]').selectOption('editor');
    await roleUpdated;
    await pageA.getByTestId('close-workspace-modal').click();

    // User B reloads
    await pageB.reload();
    await pageB.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(pageB.getByTestId('node-Col 1')).toBeVisible();
    await pageB.getByTestId('node-Col 1').click();
    await pageB.getByTestId('node-Test Request').click();

    // User B should now see the Save button
    await expect(pageB.getByTestId('request-save-btn')).toBeVisible();
  });
});

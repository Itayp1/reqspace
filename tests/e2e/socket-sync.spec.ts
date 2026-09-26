import { test, expect } from '@playwright/test';

test.describe('WebSocket Sync', () => {
  test('User B sees conflict when User A edits request', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    const timestamp = Date.now();
    const emailA = `userA_${timestamp}@example.com`;
    const emailB = `userB_${timestamp}@example.com`;
    const pass = 'password123';

    // 1. Register User B in Context B
    await pageB.goto('/register');
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(emailB);
    await pageB.getByTestId('register-password').fill(pass);
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*\/$/);
    
    // 2. Register User A in Context A
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

    // 6. User A creates and saves a request
    await pageA.getByTestId('create-request-btn').click();
    await pageA.getByTestId('request-url-input').fill('https://httpbin.org/get');
    await pageA.getByTestId('request-save-btn').click();
    await pageA.getByTestId('save-req-name-input').fill('Shared Request');
    
    const createColBtn = pageA.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      pageA.once('dialog', async dialog => await dialog.accept('Shared Collection'));
      await createColBtn.click();
      await expect(pageA.getByTestId('node-Shared Collection')).toBeVisible();
    }
    
    await pageA.getByTestId('save-req-submit-btn').click();

    // 7. User B opens the request
    // It should appear via WebSocket or after we switch workspace.
    await expect(pageB.getByTestId('node-Shared Request')).toBeVisible({ timeout: 15000 });
    await pageB.getByTestId('node-Shared Request').click();
    await expect(pageB.locator('[data-testid^="tab-"]')).toContainText('Shared Request');
    
    // 8. User A edits the request and saves
    await pageA.getByTestId('request-url-input').fill('https://httpbin.org/post');
    await pageA.getByTestId('request-save-btn').click();

    // 9. User B should see conflict indicator
    await expect(pageB.getByTestId('conflict-indicator')).toBeVisible({ timeout: 15000 });
    
    // Clean up
    await contextA.close();
    await contextB.close();
  });

  test.fixme('Multi-user realtime 13 events', async ({ page }) => {
    expect(true).toBe(true);
  });
});

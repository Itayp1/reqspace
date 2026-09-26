import { test, expect } from '@playwright/test';

test.describe('Conflict Resolution', () => {
  test('User B gets overwrite prompt when saving an outdated request', async ({ browser }) => {
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
    await pageA.getByTestId('new-workspace-btn').click();
    await pageA.getByTestId('prompt-input').fill(`WS_${timestamp}`);
    await pageA.getByTestId('prompt-submit').click();
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
    await pageA.getByTestId('save-req-name-input').fill('Conflict Request');
    
    const createColBtn = pageA.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      await pageA.getByTestId('prompt-input').fill('Conflict Collection');
      await pageA.getByTestId('prompt-submit').click();
      await expect(pageA.getByTestId('node-Conflict Collection')).toBeVisible();
    }
    
    await pageA.getByTestId('save-req-submit-btn').click();

    // 7. User B opens the request
    await expect(pageB.getByTestId('node-Conflict Request')).toBeVisible({ timeout: 15000 });
    await pageB.getByTestId('node-Conflict Request').click();
    await expect(pageB.locator('[data-testid^="tab-"]')).toContainText('Conflict Request');
    
    // 8. User A edits the request and saves
    await pageA.getByTestId('request-url-input').fill('https://httpbin.org/post');
    await pageA.getByTestId('request-save-btn').click();

    // 9. Wait for User B to receive the socket update and show conflict
    await expect(pageB.getByTestId('conflict-indicator')).toBeVisible({ timeout: 15000 });
    
    // 10. User B edits their version, tries to save
    await pageB.getByTestId('request-url-input').fill('https://httpbin.org/put');

    await pageB.getByTestId('request-save-btn').click();

    // Expect the conflict confirmation modal to have appeared with the overwrite warning
    await expect(pageB.getByText('newer version of this request exists')).toBeVisible();

    // Click cancel to save as new
    await pageB.getByTestId('confirm-cancel-btn').click();

    // Clean up
    await contextA.close();
    await contextB.close();
  });
});

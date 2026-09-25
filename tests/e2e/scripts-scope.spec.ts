import { test, expect } from '@playwright/test';

test.describe('Scripts Scope', () => {
  test('Pre-request scripts run at Collection and Folder levels', async ({ page }) => {
    const timestamp = Date.now();
    const email = `scripts_${timestamp}@example.com`;
    const pass = 'password123';
    
    // Register
    await page.goto('http://localhost:5173/register');
    await page.getByTestId('register-name').fill('Script User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill(pass);
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // Create Workspace
    page.once('dialog', async dialog => await dialog.accept(`WS_${timestamp}`));
    await page.getByTestId('new-workspace-btn').click();
    await expect(page.getByTestId('workspace-select')).toContainText(`WS_${timestamp}`);

    // Create Collection
    page.once('dialog', async dialog => await dialog.accept('Scope Collection'));
    await page.getByTestId('new-collection-empty-btn').click();
    await expect(page.getByTestId('node-Scope Collection')).toBeVisible();

    // Add Pre-request script to Collection
    await page.getByTestId('node-Scope Collection').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Collection') }).getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-edit').click();
    
    await page.getByTestId('group-edit-prerequest-tab').click();
    await page.getByTestId('group-prerequest-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(`req.headers.set('X-Collection-Script', 'executed');\nreq.variables.set('colVar', 'from-col');`);
    await page.getByTestId('group-edit-save-btn').click();

    // Create Folder
    await page.getByTestId('node-Scope Collection').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Collection') }).getByTestId('action-menu-btn').click();
    page.once('dialog', async dialog => await dialog.accept('Scope Folder'));
    await page.getByTestId('action-menu-new-folder').click();
    await expect(page.getByTestId('node-Scope Folder')).toBeVisible();

    // Add Pre-request script to Folder
    await page.getByTestId('node-Scope Folder').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Folder') }).getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-edit').click();

    await page.getByTestId('group-edit-prerequest-tab').click();
    await page.getByTestId('group-prerequest-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(`req.headers.set('X-Folder-Script', 'executed');\nreq.variables.set('folderVar', 'from-folder');`);
    await page.getByTestId('group-edit-save-btn').click();

    // Create Request inside Folder
    await page.getByTestId('node-Scope Folder').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Folder') }).getByTestId('action-menu-btn').click();
    page.once('dialog', async dialog => await dialog.accept('Scope Request'));
    await page.getByTestId('action-menu-new-request').click();

    // Open Request
    await page.getByTestId('node-Scope Request').click();

    // Mock Response
    let capturedHeaders: any = {};
    let capturedUrl = '';
    await page.route('**/proxy', async (route) => {
      const request = route.request();
      if (request.method() === 'POST' && request.url().includes('/proxy')) {
        const postData = request.postDataJSON();
        capturedHeaders = postData?.headers;
        capturedUrl = postData?.url;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 200,
            body: { success: true }
          }),
        });
        return;
      }
      await route.continue();
    });

    // Configure Request
    await page.getByTestId('request-url-input').fill('https://example.com/{{colVar}}/{{folderVar}}');
    
    // Add Request-level script
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(`req.headers.set('X-Request-Script', 'executed');`);

    // Send Request
    await page.getByTestId('request-send-btn').click();

    // Verify headers and URL
    await expect(page.getByTestId('monaco-editor-container').last()).toContainText('success');
    
    expect(capturedHeaders['X-Collection-Script']).toBe('executed');
    expect(capturedHeaders['X-Folder-Script']).toBe('executed');
    expect(capturedHeaders['X-Request-Script']).toBe('executed');
    
    expect(capturedUrl).toBe('https://example.com/from-col/from-folder');
  });
});

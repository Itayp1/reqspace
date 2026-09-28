import { test, expect } from '@playwright/test';

test.describe('Scripts Scope', () => {
  test('Pre-request scripts run at Collection and Folder levels', async ({ page }) => {
    const timestamp = Date.now();
    const email = `scripts_${timestamp}@example.com`;
    const pass = 'password123';

    // Register
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Script User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill(pass);
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // Create Workspace (custom in-app modal, not a native dialog)
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(`WS_${timestamp}`);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('workspace-select')).toContainText(`WS_${timestamp}`);

    // Create Collection
    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Scope Collection');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Scope Collection')).toBeVisible();

    // Add Pre-request script to Collection. Typing punctuation like ( ) '
    // directly triggers Monaco's auto-closing pairs and mangles the text —
    // paste it instead.
    await page.getByTestId('node-Scope Collection').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Collection') }).getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-edit').click();

    await page.getByTestId('group-edit-prerequest-tab').click();
    const collectionEditor = page.getByTestId('group-prerequest-editor');
    await collectionEditor.getByTestId('monaco-editor-container').click();
    await page.keyboard.insertText(`req.headers.set('X-Collection-Script', 'executed');\nreq.variables.set('colVar', 'from-col');`);
    await expect(collectionEditor.locator('.view-lines')).toContainText('executed');
    await page.getByTestId('group-edit-save-btn').click();

    // Create Folder (custom in-app modal, not a native dialog)
    await page.getByTestId('node-Scope Collection').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Collection') }).getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Scope Folder');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Scope Folder')).toBeVisible();

    // Add Pre-request script to Folder
    await page.getByTestId('node-Scope Folder').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Folder') }).getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-edit').click();

    await page.getByTestId('group-edit-prerequest-tab').click();
    const folderEditor = page.getByTestId('group-prerequest-editor');
    await folderEditor.getByTestId('monaco-editor-container').click();
    await page.keyboard.insertText(`req.headers.set('X-Folder-Script', 'executed');\nreq.variables.set('folderVar', 'from-folder');`);
    await expect(folderEditor.locator('.view-lines')).toContainText('executed');
    await page.getByTestId('group-edit-save-btn').click();

    // Create Request inside Folder (custom in-app modal, not a native dialog)
    await page.getByTestId('node-Scope Folder').hover();
    await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Folder') }).getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Scope Request');
    await page.getByTestId('prompt-submit').click();

    // Creating a request auto-opens the ancestor collection but not the
    // specific folder it was added to (folder open/closed is separate local
    // state) — expand it before the new request node is in the DOM.
    await page.getByTestId('node-Scope Folder').click();

    // Open Request
    await page.getByTestId('node-Scope Request').click();

    // Mock the actual target — there is no server-side proxy relay, the
    // browser transport does a direct fetch(url).
    let capturedHeaders: Record<string, string> = {};
    let capturedUrl = '';
    await page.route('https://example.com/**', async (route) => {
      capturedHeaders = route.request().headers();
      capturedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Configure Request
    await page.getByTestId('request-url-input').fill('https://example.com/{{colVar}}/{{folderVar}}');

    // Add Request-level script
    await page.getByTestId('req-tab-pre-request-script').click();
    const requestEditor = page.getByTestId('monaco-editor-container');
    await requestEditor.click();
    await page.keyboard.insertText(`req.headers.set('X-Request-Script', 'executed');`);
    await expect(requestEditor.locator('.view-lines')).toContainText('executed');

    // Send Request
    await page.getByTestId('request-send-btn').click();

    // Verify headers and URL
    await expect(page.getByTestId('response-body-viewer')).toContainText('success');

    console.log('CAPTURED HEADERS:', capturedHeaders);
    console.log('CAPTURED URL:', capturedUrl);

    expect(capturedHeaders['x-collection-script']).toBe('executed');
    expect(capturedHeaders['x-folder-script']).toBe('executed');
    expect(capturedHeaders['x-request-script']).toBe('executed');

    expect(capturedUrl).toBe('https://example.com/from-col/from-folder');
  });
});

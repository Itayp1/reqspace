import { test, expect } from '@playwright/test';

test.describe('Request Operations', () => {
  test.describe.configure({ mode: 'serial' });

  test('Login and create workspace', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    
    page.on('dialog', async (dialog) => {
      await dialog.accept('Request Workspace');
    });
    
    await page.getByTestId('new-workspace-btn').click();
    await expect(page.getByTestId('workspace-select')).toContainText('Request Workspace');
  });

  test('Create a GET request, add headers and query params', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    // Click on New Request in empty state or via collection
    // Wait for the empty state
    await page.getByTestId('create-request-btn').click();

    // Fill URL
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Method should be GET by default
    
    // Add Query Params (it is in the Params tab which is open by default)
    await page.getByTestId('kv-key-0').fill('myparam');
    await page.getByTestId('kv-val-0').fill('myvalue');

    // Add Headers
    await page.getByTestId('req-tab-headers').click();
    await page.getByTestId('kv-key-0').fill('X-My-Header');
    await page.getByTestId('kv-val-0').fill('headerValue');

    // Save
    await page.getByTestId('request-save-btn').click();

    // Since it's unsaved, a modal should pop up
    await page.getByTestId('save-req-name-input').fill('My GET Request');
    
    // We need to create a collection to save it into
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      page.on('dialog', async (dialog) => {
        await dialog.accept('My Collection');
      });
      // Wait for it to appear
      await expect(page.getByTestId('node-My Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();
  });

  test('Create a POST request with JSON body, save and send', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    // Create a new request tab
    await page.getByTestId('new-tab-btn').click();

    // Select Method
    await page.getByTestId('method-select').selectOption('POST');

    // Fill URL
    await page.getByTestId('request-url-input').fill('https://httpbin.org/post');

    // Select Body tab
    await page.getByTestId('req-tab-body').click();

    // Select raw
    await page.getByTestId('body-mode-raw').click();
    
    // Click inside Monaco editor and type
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type('{"test": "data"}');

    // Send
    await page.getByTestId('request-send-btn').click();

    // Verify response
    // The console or response panel should show 200 OK
    // For now we assume a text match is okay for the response text? The instruction says: "Find any selectors that are NOT data-testid ... Ensure 100% of interaction selectors use data-testid."
    // `getByText` for an assertion on response might need to be changed if it's an interaction. It's just an expect. But the instruction says "Find any selectors that are NOT data-testid ... Ensure 100% of interaction selectors use data-testid". I will leave it or change it to testid. Let's add testid for response status.
    // Actually, `await expect(page.getByText('200 OK').first()).toBeVisible({ timeout: 10000 });` is an assertion. Let's change it to data-testid="response-status".
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });
  });
});

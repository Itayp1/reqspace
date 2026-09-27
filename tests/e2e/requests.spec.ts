import { test, expect } from '@playwright/test';

test.describe('Request Operations', () => {
  test.describe.configure({ mode: 'serial' });

  test('Login and create workspace', async ({ page }) => {
    await page.goto('/login');
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
    await page.goto('/');

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
    await page.goto('/');

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

  test('Bearer auth persists and resolves after save+reload', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-auth').click();
    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('my-super-secret-token');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Bearer Test');
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      page.on('dialog', async (dialog) => {
        await dialog.accept('Test Collection');
      });
      await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('node-Bearer Test').click();

    await page.getByTestId('req-tab-auth').click();
    await expect(page.getByTestId('auth-type-select')).toHaveValue('bearer');
    await expect(page.getByTestId('auth-bearer-token')).toHaveValue('my-super-secret-token');

    const requestPromise = page.waitForRequest(req => req.url().includes('/echo'));
    await page.route('**/echo', route => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('request-send-btn').click();
    const req = await requestPromise;
    expect(req.headers()['authorization']).toBe('Bearer my-super-secret-token');
  });

  test('Basic auth persists and resolves after save+reload', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-auth').click();
    await page.getByTestId('auth-type-select').selectOption('basic');
    await page.getByTestId('auth-basic-username').fill('admin');
    await page.getByTestId('auth-basic-password').fill('password123');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Basic Test');
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      page.on('dialog', async (dialog) => {
        await dialog.accept('Test Collection');
      });
      await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('node-Basic Test').click();

    await page.getByTestId('req-tab-auth').click();
    await expect(page.getByTestId('auth-type-select')).toHaveValue('basic');
    await expect(page.getByTestId('auth-basic-username')).toHaveValue('admin');
    await expect(page.getByTestId('auth-basic-password')).toHaveValue('password123');

    const requestPromise = page.waitForRequest(req => req.url().includes('/echo'));
    await page.route('**/echo', route => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('request-send-btn').click();
    const req = await requestPromise;
    const authHeader = req.headers()['authorization'];
    expect(authHeader).toBe('Basic YWRtaW46cGFzc3dvcmQxMjM=');
  });

  test('Raw JSON body persists after save+reload and is sent as the request body', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-raw').click();
    await page.getByTestId('body-raw-language-select').selectOption('json');
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type('{"mykey":"myval"}');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('JSON Test');
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      page.on('dialog', async (dialog) => {
        await dialog.accept('Test Collection');
      });
      await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('node-JSON Test').click();

    await page.getByTestId('req-tab-body').click();
    await expect(page.getByTestId('body-raw-language-select')).toHaveValue('json');
    await expect(page.getByTestId('monaco-editor-container')).toContainText('"mykey"');

    const requestPromise = page.waitForRequest(req => req.url().includes('/echo'));
    await page.route('**/echo', route => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('request-send-btn').click();
    const req = await requestPromise;
    expect(req.postData()).toContain('"mykey"');
    expect(req.headers()['content-type']).toContain('application/json');
  });

  test('Form-data body persists and sends multipart fields correctly', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-form-data').click();
    await page.getByTestId('kv-key-0').fill('formField');
    await page.getByTestId('kv-val-0').fill('formValue');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Form Test');
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      page.on('dialog', async (dialog) => {
        await dialog.accept('Test Collection');
      });
      await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('node-Form Test').click();

    await page.getByTestId('req-tab-body').click();
    await expect(page.getByTestId('kv-key-0')).toHaveValue('formField');
    await expect(page.getByTestId('kv-val-0')).toHaveValue('formValue');

    const requestPromise = page.waitForRequest(req => req.url().includes('/echo'));
    await page.route('**/echo', route => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('request-send-btn').click();
    const req = await requestPromise;
    expect(req.headers()['content-type']).toContain('multipart/form-data');
    expect(req.postData()).toContain('formField');
    expect(req.postData()).toContain('formValue');
  });

  test('URL-encoded body persists and sends as application/x-www-form-urlencoded', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-urlencoded').click();
    await page.getByTestId('kv-key-0').fill('urlField');
    await page.getByTestId('kv-val-0').fill('urlValue');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('UrlEncoded Test');
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      page.on('dialog', async (dialog) => {
        await dialog.accept('Test Collection');
      });
      await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('node-UrlEncoded Test').click();

    await page.getByTestId('req-tab-body').click();
    await expect(page.getByTestId('kv-key-0')).toHaveValue('urlField');
    await expect(page.getByTestId('kv-val-0')).toHaveValue('urlValue');

    const requestPromise = page.waitForRequest(req => req.url().includes('/echo'));
    await page.route('**/echo', route => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('request-send-btn').click();
    const req = await requestPromise;
    expect(req.headers()['content-type']).toContain('application/x-www-form-urlencoded');
    expect(req.postData()).toContain('urlField=urlValue');
  });

  test('Dirty state indicators and undo/redo', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    
    // Fill URL to trigger dirty state
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Check dirty indicator is visible
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();

    // Save request to clear dirty state
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Dirty Test Request');
    
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      page.on('dialog', async (dialog) => {
        await dialog.accept('Test Collection');
      });
      await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();

    // Dirty indicator should be gone after save
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    // Make another change to test undo/redo
    await page.getByTestId('request-url-input').fill('https://httpbin.org/post');
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();

    // Test Undo
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://httpbin.org/get');
    
    // Test Redo
    await page.keyboard.press(`${modifier}+Shift+Z`);
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://httpbin.org/post');
  });
});

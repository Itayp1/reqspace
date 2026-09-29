import { test, expect } from '@playwright/test';

test.describe('Request Operations', () => {
  test.describe.configure({ mode: 'serial' });

  // Unique per run: the live server accumulates workspaces/collections across
  // every spec file in the full suite, so a fixed name would collide.
  const WORKSPACE_NAME = `Request Workspace ${Date.now()}`;
  let workspaceId = '';

  test.beforeEach(async ({ page }) => {
    // Each test gets a fresh browser context — there's no session left over
    // from the previous test, so every test has to log in for itself.
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('Login and create workspace', async ({ page }) => {
    // Custom in-app modal, not a native dialog
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(WORKSPACE_NAME);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('workspace-select')).toContainText(WORKSPACE_NAME);
    workspaceId = await page.getByTestId('workspace-select').inputValue();

    // Every later test in this file saves a request — create the target
    // collection once, up front, via the sidebar. The Save modal itself
    // can't create one (its list just says "No collections found" when
    // empty and the submit button stays disabled), and it can't be created
    // "inline" during save either since the modal overlay blocks the sidebar.
    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Test Collection');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
  });

  test('Create a GET request, add headers and query params', async ({ page }) => {
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('new-tab-btn').click();

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

    // Save. The Test Collection created in the previous test already exists
    // and gets auto-selected by the modal, so this is just name + submit.
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('My GET Request');
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('save-req-name-input')).toBeHidden();
    // Save opens the collection. Clicking the row toggles it shut.
    await expect(page.getByTestId('node-My GET Request')).toBeVisible();
  });

  test('Create a POST request with JSON body, save and send', async ({ page }) => {
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();

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

    // Real HTTP/2 responses (as httpbin.org serves) have no reason phrase.
    await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 10000 });
  });

  test('Bearer auth persists and resolves after save+reload', async ({ page }) => {
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('my-super-secret-token');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Bearer Test');
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('node-Test Collection').click();
    await page.getByTestId('node-Bearer Test').click();

    await page.getByTestId('req-tab-authorization').click();
    await expect(page.getByTestId('auth-type-select')).toHaveValue('bearer');
    await expect(page.getByTestId('auth-bearer-token')).toHaveValue('my-super-secret-token');

    const requestPromise = page.waitForRequest(req => req.url().includes('/echo'));
    await page.route('**/echo', route => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('request-send-btn').click();
    const req = await requestPromise;
    expect(req.headers()['authorization']).toBe('Bearer my-super-secret-token');
  });

  test('Basic auth persists and resolves after save+reload', async ({ page }) => {
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('basic');
    await page.getByTestId('auth-basic-username').fill('admin');
    await page.getByTestId('auth-basic-password').fill('password123');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Basic Test');
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('node-Test Collection').click();
    await page.getByTestId('node-Basic Test').click();

    await page.getByTestId('req-tab-authorization').click();
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

  test('Auth header and request body are both sent', async ({ page }) => {
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('my-super-secret-token');

    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-urlencoded').click();
    await page.getByTestId('kv-key-0').fill('urlField');
    await page.getByTestId('kv-val-0').fill('urlValue');

    const urlencodedPromise = page.waitForRequest(req => req.url().includes('/echo') && req.method() === 'POST');
    await page.route('**/echo', route => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('request-send-btn').click();
    const urlencoded = await urlencodedPromise;
    expect(urlencoded.headers()['authorization']).toBe('Bearer my-super-secret-token');
    expect(urlencoded.headers()['content-type']).toContain('application/x-www-form-urlencoded');
    expect(urlencoded.postData()).toContain('urlField=urlValue');

    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('basic');
    await page.getByTestId('auth-basic-username').fill('admin');
    await page.getByTestId('auth-basic-password').fill('password123');

    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-form-data').click();
    await page.getByTestId('kv-key-0').fill('formField');
    await page.getByTestId('kv-val-0').fill('formValue');

    const formPromise = page.waitForRequest(req => req.url().includes('/echo') && (req.headers()['content-type'] || '').includes('multipart/form-data'));
    await page.getByTestId('request-send-btn').click();
    const form = await formPromise;
    expect(form.headers()['authorization']).toBe('Basic YWRtaW46cGFzc3dvcmQxMjM=');
    expect(form.headers()['content-type']).toContain('multipart/form-data');
    expect(form.postData()).toContain('formField');
    expect(form.postData()).toContain('formValue');
  });

  test('Raw JSON body persists after save+reload and is sent as the request body', async ({ page }) => {
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
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
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('node-Test Collection').click();
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
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-form-data').click();
    await page.getByTestId('kv-key-0').fill('formField');
    await page.getByTestId('kv-val-0').fill('formValue');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Form Test');
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('node-Test Collection').click();
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
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');

    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-urlencoded').click();
    await page.getByTestId('kv-key-0').fill('urlField');
    await page.getByTestId('kv-val-0').fill('urlValue');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('UrlEncoded Test');
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    await page.reload();
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('node-Test Collection').click();
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
    await page.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
    await page.getByTestId('new-tab-btn').click();

    // Fill URL to trigger dirty state
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Check dirty indicator is visible
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();

    // Save request to clear dirty state
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Dirty Test Request');
    await page.getByTestId('save-req-submit-btn').click();

    // Dirty indicator should be gone after save
    await expect(page.getByTestId('dirty-indicator')).not.toBeVisible();

    // Make another change to test undo/redo. Edits within 500ms of each
    // other are coalesced (deliberately, so continuous typing doesn't spam
    // the undo stack) — wait past that window so this edit's pre-change
    // state ("/get") actually gets pushed and is there to undo back to.
    await page.waitForTimeout(600);
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

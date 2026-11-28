import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '../fixtures';
import { startNewRequest, expectWorkspaceListed, registerUser } from '../helpers';
import { mockServer, scene, envVar } from '../scene';

test.describe('Script Execution', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // 1. Register and Login (runs for each test)
    
    await registerUser(page, 'scripts', 'Script User');
    
    // Setup route mock for all tests
    await page.route('https://httpbin.org/**', route => {
      if (route.request().url().includes('/status/201')) {
        return route.fulfill({ status: 201, statusText: 'Created', contentType: 'application/json', body: '{}' });
      }
      return route.fulfill({
        status: 200,
        statusText: 'OK',
        contentType: 'application/json',
        body: JSON.stringify({ url: route.request().url() }),
      });
    });
  });

  test('Pre-request script sets environment variable', async ({ page }) => {
    // 2. Create and select Environment
    await page.getByTestId('tab-environments').click();
    
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Test Env');
    await page.getByTestId('prompt-input').press('Enter');
    
    // Wait for the environment to be created and appear in sidebar
    await expect(page.getByTestId('env-node-Test Env')).toBeVisible();
    
    // Select the environment in the top bar dropdown
    await expect(page.getByTestId('env-select')).toContainText('Test Env');
    await page.getByTestId('env-select').selectOption({ label: 'Test Env' });

    // 3. Create a request
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // 4. Write Pre-request Script
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'pm.environment.set("myvar", "123");');
    await page.keyboard.press('Control+V');

    // 5. Send Request
    await page.getByTestId('request-send-btn').click();
    
    // Wait for response to be 200 OK
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // 6. Verify environment variable
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-node-Test Env').click();
    
    // Wait for the tab to open
    const envTab = page.locator('[data-testid^="tab-"]:not([role="tab"])', { hasText: 'Test Env' });
    await expect(envTab).toBeVisible();
    
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('myvar');
    await expect(page.getByTestId('env-var-current-0')).toHaveValue('123');
  });

  test('Failing assertions display correctly', async ({ page }) => {
    // 1. Create a request
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // 2. Write Test Script with failing assertion
    await page.getByTestId('req-tab-tests').click();
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'pm.test("Should fail", function() { pm.expect(1).to.eql(2); });\npm.test("Should pass", function() { pm.expect(1).to.eql(1); });');
    await page.keyboard.press('Control+V');

    // 3. Send Request
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // 4. Verify test results tab
    await page.getByTestId('response-tab-test_results').click();
    
    const results = page.getByTestId('test-result-item');
    await expect(results).toHaveCount(2);

    const failResult = results.nth(0);
    await expect(failResult.getByTestId('test-result-name')).toContainText('Should fail');
    await expect(failResult.getByTestId('test-result-status')).toContainText('FAIL');
    await expect(failResult).toContainText('expected 1 to deeply equal 2'); // The error message

    const passResult = results.nth(1);
    await expect(passResult.getByTestId('test-result-name')).toContainText('Should pass');
    await expect(passResult.getByTestId('test-result-status')).toContainText('PASS');
  });

  test('pm.sendRequest behavior', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Pre-request script to send a request
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), `pm.sendRequest('https://httpbin.org/status/201', function (err, res) { pm.globals.set("sr_code", res.code); });`);
    await page.keyboard.press('Control+V');

    // We need to wait for sendRequest to finish before the main request is sent.
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // Verify environment variable set by sendRequest
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-globals-btn').click();
    
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('sr_code');
    await expect(page.getByTestId('env-var-current-0')).toHaveValue('201');
  });

  test('Script isolation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Pre-request script defining a variable
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'var my_isolated_var = "hello";');
    await page.keyboard.press('Control+V');

    // Test script trying to access it
    await page.getByTestId('req-tab-tests').click();
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'pm.test("Isolated var is undefined", function() { pm.expect(typeof my_isolated_var).to.eql("undefined"); });');
    await page.keyboard.press('Control+V');

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // Verify test passed
    await page.getByTestId('response-tab-test_results').click();
    const result = page.getByTestId('test-result-item').nth(0);
    await expect(result.getByTestId('test-result-status')).toContainText('PASS');
  });
});

function container(page: import('@playwright/test').Page, nodeName: string) {
  return page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${nodeName}`) });
}

async function openMenu(page: import('@playwright/test').Page, nodeName: string) {
  const node = container(page, nodeName);
  await node.hover();
  await node.getByTestId('action-menu-btn').click();
}

test('collection, folder and request test scripts all run for one request', async ({ page }) => {
  await registerUser(page, 'grouptest', 'Group User');

  await page.route('https://group.example.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  );

  await page.getByTestId('new-collection-empty-btn').click();
  await page.getByTestId('prompt-input').fill('Group Collection');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('node-Group Collection')).toBeVisible();

  // Collection-level test script.
  await openMenu(page, 'Group Collection');
  await page.getByTestId('action-menu-edit-settings').click();
  await page.getByTestId('group-edit-test-tab').click();
  const colEditor = page.getByTestId('group-test-editor');
  await colEditor.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
  // Pasted rather than typed: Monaco auto-closes brackets and quotes.
  // pm.response.code via pm.expect; the status() chain is covered by QA-42.
  await page.keyboard.insertText(`pm.test('collection-level test', function () { pm.expect(pm.response.code).to.equal(200); });`);
  await expect(colEditor.locator('.view-lines')).toContainText('collection-level test');
  await page.getByTestId('group-edit-save-btn').click();

  // Folder-level test script.
  await openMenu(page, 'Group Collection');
  await page.getByTestId('action-menu-new-folder').click();
  await page.getByTestId('prompt-input').fill('Group Folder');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('node-Group Folder')).toBeVisible();

  await openMenu(page, 'Group Folder');
  await page.getByTestId('action-menu-edit-settings').click();
  // Folders have no Variables tab, so they open on Pre-request.
  await expect(page.getByTestId('group-edit-variables-tab')).toBeHidden();
  await page.getByTestId('group-edit-test-tab').click();
  const folderEditor = page.getByTestId('group-test-editor');
  await folderEditor.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
  await page.keyboard.insertText(`pm.test('folder-level test', function () { pm.expect(1).to.eql(1); });`);
  await expect(folderEditor.locator('.view-lines')).toContainText('folder-level test');
  await page.getByTestId('group-edit-save-btn').click();

  // A request in the folder, with its own test script plus one deliberate
  // failure so the pass/fail split is visible.
  await startNewRequest(page, 'Group Folder');
  await page.getByTestId('prompt-input').fill('Group Request');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('prompt-input')).toBeHidden();
  const reqNode = page.getByTestId('node-Group Request');
  await expect(reqNode).toBeVisible(); // the folder auto-expands on create
  await reqNode.click();

  await page.getByTestId('request-url-input').fill('https://group.example.com/thing');
  await page.getByTestId('req-tab-tests').click();
  await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
  await page.keyboard.insertText(`pm.test('request-level test', function () { pm.expect(2).to.eql(2); });\npm.test('deliberate failure', function () { pm.expect(1).to.eql(2); });`);
  await page.getByTestId('request-save-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toBeHidden();

  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');

  // All three scopes' tests ran, and the failing one is reported as failed.
  await page.getByTestId('response-tab-test_results').click();
  const items = page.getByTestId('test-result-item');
  await expect(items).toHaveCount(4);
  for (const name of ['collection-level test', 'folder-level test', 'request-level test']) {
    const row = items.filter({ hasText: name });
    await expect(row.getByTestId('test-result-status')).toHaveText('PASS');
  }
  const failed = items.filter({ hasText: 'deliberate failure' });
  await expect(failed.getByTestId('test-result-status')).toHaveText('FAIL');
});

test('Pre-request scripts run at Collection and Folder levels', async ({ page }) => {
  const timestamp = Date.now();

  await registerUser(page, 'scripts', 'Script User');

  // Create Workspace (custom in-app modal, not a native dialog)
  await page.getByTestId('new-workspace-btn').click();
  await page.getByTestId('prompt-input').fill(`WS_${timestamp}`);
  await page.getByTestId('prompt-submit').click();
  await expectWorkspaceListed(page, `WS_${timestamp}`);

  // Create Collection
  await page.getByTestId('new-collection-empty-btn').click();
  await page.getByTestId('prompt-input').fill('Scope Collection');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('node-Scope Collection')).toBeVisible();

  // Add Pre-request script to Collection. Typing punctuation like ( ) '
  // directly triggers Monaco's auto-closing pairs and mangles the text —
  // paste it instead.
  await page.getByTestId('node-Scope Collection').hover();
  await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Collection') }).getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-edit-settings').click();

  await page.getByTestId('group-edit-prerequest-tab').click();
  const collectionEditor = page.getByTestId('group-prerequest-editor');
  await collectionEditor.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
  await page.keyboard.insertText(`req.headers.set('X-Collection-Script', 'executed');\nreq.variables.set('colVar', 'from-col');`);
  await expect(collectionEditor.locator('.view-lines')).toContainText('executed');
  await page.getByTestId('group-edit-save-btn').click();

  // Create Folder (custom in-app modal, not a native dialog)
  await page.getByTestId('node-Scope Collection').hover();
  await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Collection') }).getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-new-folder').click();
  await page.getByTestId('prompt-input').fill('Scope Folder');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('node-Scope Folder')).toBeVisible();

  // Add Pre-request script to Folder
  await page.getByTestId('node-Scope Folder').hover();
  await page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Folder') }).getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-edit-settings').click();

  await page.getByTestId('group-edit-prerequest-tab').click();
  const folderEditor = page.getByTestId('group-prerequest-editor');
  await folderEditor.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
  await page.keyboard.insertText(`req.headers.set('X-Folder-Script', 'executed');\nreq.variables.set('folderVar', 'from-folder');`);
  await expect(folderEditor.locator('.view-lines')).toContainText('executed');
  await page.getByTestId('group-edit-save-btn').click();

  // Create Request inside Folder (custom in-app modal, not a native dialog)
  await page.getByTestId('node-Scope Folder').hover();
  await startNewRequest(page, page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Scope Folder') }));
  await page.getByTestId('prompt-input').fill('Scope Request');
  await page.getByTestId('prompt-input').press('Enter');

  // Creating a request auto-expands the folder it was added to.

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
  await requestEditor.locator('.monaco-editor').first().click();
  await page.keyboard.insertText(`req.headers.set('X-Request-Script', 'executed');`);
  await expect(requestEditor.locator('.view-lines')).toContainText('executed');

  // Send Request
  await page.getByTestId('request-send-btn').click();

  // Verify headers and URL
  await expect(page.getByTestId('response-body-viewer')).toContainText('success');

  expect(capturedHeaders['x-collection-script']).toBe('executed');
  expect(capturedHeaders['x-folder-script']).toBe('executed');
  expect(capturedHeaders['x-request-script']).toBe('executed');

  expect(capturedUrl).toBe('https://example.com/from-col/from-folder');
});

// QA-42: the "Check Status Code is 200" snippet (pm.response.to.have.status) threw in the sandbox.
test('QA-42: pm.response.to.have.status(200) passes, a wrong status fails, in a test script', async ({ page }) => {
  await mockServer(page);
  await scene(page, { testScript: 'pm.test("ok200", function () { pm.response.to.have.status(200); });\npm.test("is404", function () { pm.response.to.have.status(404); });\npm.test("ok chain", () => pm.response.to.be.ok);' });
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  await page.getByTestId('response-tab-test_results').click();
  const items = page.getByTestId('test-result-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).getByTestId('test-result-status')).toHaveText('PASS');
  await expect(items.nth(1).getByTestId('test-result-status')).toHaveText('FAIL');
  await expect(items.nth(1)).toContainText('404');
  await expect(items.nth(2).getByTestId('test-result-status')).toHaveText('PASS');
});

// QA-43: the snippets must say which pm.request.headers API is supported (object assignment, not add()).
test('QA-43: pre-request snippet documents pm.request.headers assignment and it works', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page);
  await page.getByTestId('req-tab-pre-request-script').click();
  await page.getByText('Set request header (pre-request)').click();
  await expect(page.getByTestId('monaco-editor-container')).toContainText('headers.add() is not supported');
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.some((r) => r.headers['x-header'] === 'value')).toBeTruthy();
});

/**
 * Postman pm.request / pm.response parity (docs/specs/pm-request-response-api.md).
 * One script (fixtures/pm-api-all.js) runs as pre-request and as test script; every member is one pm.test().
 * The transport is stubbed through window.electron because a browser fetch() hides Set-Cookie.
 */
const script = readFileSync(join(__dirname, '..', 'fixtures', 'pm-api-all.js'), 'utf8');
const countTests = (s: string) => (s.match(/(?:^|[^.\w])t\('|pm\.test\('/gm) || []).length;
const bothCount = countTests(script.split('//#BOTH')[1].split('//#PRE')[0]);
const preCount = countTests(script.split('//#PRE')[1].split('//#POST')[0]);
const postCount = countTests(script.split('//#POST')[1]);

async function stubTransport(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__sent = [];
    w.electron = {
      sendRequest: async (payload: any) => {
        w.__sent.push(payload);
        return {
          status: 200, statusText: 'OK', isBase64: false, responseTime: 12, size: 60,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-custom': 'custom-val',
            'set-cookie': ['sid=abc; Path=/; HttpOnly; Domain=mock.test; Expires=Wed, 01 Jan 2031 00:00:00 GMT', 'theme=dark; Path=/p; Secure'],
          },
          body: '{"id":7,"name":"widget","tags":["a","b"],"nested":{"ok":true}}',
        };
      },
      abortRequest: () => {},
    };
  });
}

const base = {
  method: 'POST',
  url: 'https://mock.test/api/v1/items?a=1&b=2',
  headers: [
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'X-Keep', value: 'keep', enabled: true },
    { key: 'X-Remove', value: 'gone', enabled: true },
    { key: 'X-Update', value: 'old', enabled: true },
  ],
  body: { mode: 'raw', raw: '{"hello":"world"}', rawLanguage: 'json' },
  auth: { type: 'bearer', bearer: { token: 'tok' } },
};

async function sendAndRead(page: Page) {
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 15000 });
  await page.getByTestId('response-tab-test_results').click();
  await expect(page.getByTestId('test-result-item').first()).toBeVisible();
  const items = page.getByTestId('test-result-item');
  const out: Array<{ name: string; status: string; text: string }> = [];
  for (const it of await items.all()) {
    out.push({ name: (await it.getByTestId('test-result-name').textContent()) || '', status: (await it.getByTestId('test-result-status').textContent()) || '', text: (await it.textContent()) || '' });
  }
  return out;
}

test('pm.request / pm.response: every member of the API works in both phases', async ({ page }) => {
  await stubTransport(page);
  await scene(page, { ...base, preRequestScript: script, testScript: script });

  const results = await sendAndRead(page);
  const failed = results.filter((r) => r.status !== 'PASS');
  expect(failed.map((r) => `${r.name} | ${r.text}`), 'failing members').toEqual([]);
  expect(results.length, 'tests that ran').toBe(bothCount * 2 + preCount + postCount);
  expect(results.filter((r) => r.name.startsWith('pre: ')).length).toBe(bothCount + preCount);
  expect(results.filter((r) => r.name.startsWith('post: ')).length).toBe(bothCount + postCount);

  // What the pre-request script did must be on the wire.
  const sent = await page.evaluate(() => (window as any).__sent);
  expect(sent).toHaveLength(1);
  const h = Object.fromEntries(Object.entries(sent[0].headers).map(([k, v]) => [k.toLowerCase(), v]));
  expect(sent[0].method).toBe('PUT');
  const url = new URL(sent[0].url);
  expect(url.origin + url.pathname).toBe('https://mock.test/api/v1/items');
  expect([...url.searchParams.entries()]).toEqual([['a', '1'], ['c', '3'], ['d', '4'], ['e', '5']]);
  expect(sent[0].body).toBe('{"hello":"edited"}');
  expect(h).toMatchObject({ 'x-pre-done': '1', 'x-added': '1', 'x-str': 's', 'x-update': 'new', 'x-upserted': 'new', 'x-idx': 'idx', 'x-keep': 'keep' });
  expect(h).not.toHaveProperty('x-remove');
  expect(h).not.toHaveProperty('x-post'); // post-response mutations are ignored
});

test('Collection Runner applies pre-request changes (addHeader, method, url) like Send', async ({ page }) => {
  await stubTransport(page);
  await scene(page, {
    ...base, method: 'GET', body: { mode: 'none' },
    preRequestScript: "pm.request.addHeader({ key: 'X-Run-Added', value: '1' }); pm.request.removeHeader('X-Remove'); pm.request.method = 'PUT'; pm.request.url.addQueryParams('r=1');",
  });
  const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Col') });
  await col.hover();
  await col.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  await expect(page.getByTestId('collection-runner-modal')).toBeVisible();
  await page.getByTestId('collection-runner-run-btn').click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent.length)).toBe(1);
  const sent = (await page.evaluate(() => (window as any).__sent))[0];
  const h = Object.fromEntries(Object.entries(sent.headers).map(([k, v]) => [k.toLowerCase(), v]));
  expect(sent.method).toBe('PUT');
  expect(sent.url).toContain('r=1');
  expect(h).toMatchObject({ 'x-run-added': '1', 'x-keep': 'keep' });
  expect(h).not.toHaveProperty('x-remove');
});

test('Collection Runner applies pre-request body and header-value changes', async ({ page }) => {
  await stubTransport(page);
  await scene(page, {
    ...base,
    preRequestScript: "pm.request.headers.upsert({ key: 'X-Update', value: 'new' }); pm.request.body.raw = '{\"changed\":true}';",
  });
  const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Col') });
  await col.hover();
  await col.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-run-btn').click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent.length)).toBe(1);
  const sent = (await page.evaluate(() => (window as any).__sent))[0];
  const h = Object.fromEntries(Object.entries(sent.headers).map(([k, v]) => [k.toLowerCase(), v]));
  expect(h['x-update']).toBe('new');
  expect(sent.body).toBe('{"changed":true}');
});

test('Collection Runner: pm.iterationData is the data row and wins over environment in pm.variables', async ({ page }) => {
  await stubTransport(page);
  await scene(page, {
    ...base,
    preRequestScript: "pm.request.addHeader({ key: 'X-Data', value: JSON.stringify(pm.iterationData.toObject()) }); pm.request.addHeader({ key: 'X-Prec', value: pm.variables.get('pv') }); pm.request.addHeader({ key: 'X-Env', value: pm.environment.get('pv') }); pm.request.addHeader({ key: 'X-Has', value: String(pm.iterationData.has('dk')) });",
  }, [{ key: 'pv', value: 'fromenv', initialValue: 'fromenv', currentValue: 'fromenv', enabled: true }]);
  const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Col') });
  await col.hover();
  await col.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-data-file').setInputFiles({ name: 'd.json', mimeType: 'application/json', buffer: Buffer.from('[{"dk":"dv","pv":"fromdata"}]') });
  await page.getByTestId('collection-runner-run-btn').click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent.length)).toBe(1);
  const sent = (await page.evaluate(() => (window as any).__sent))[0];
  const h = Object.fromEntries(Object.entries(sent.headers).map(([k, v]) => [k.toLowerCase(), v]));
  expect(JSON.parse(h['x-data'] as string)).toEqual({ dk: 'dv', pv: 'fromdata' });
  expect(h).toMatchObject({ 'x-prec': 'fromdata', 'x-env': 'fromenv', 'x-has': 'true' });
});

test.describe('Pre-request and test scripts: variables, pm.request, pm.response', () => {
  test('[F1.1] environment/globals/collection/local variables set by a script are used in the same request', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, {
      url: 'https://mock.test/x?a={{a}}&b={{b}}&c={{c}}',
      preRequestScript: "pm.environment.set('a','1'); pm.globals.set('b','2'); pm.collectionVariables.set('c','3'); pm.variables.set('d','4');",
    }, [envVar('seedv', 's')]);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    const u = new URL(seen.at(-1)!.url);
    expect([u.searchParams.get('a'), u.searchParams.get('b'), u.searchParams.get('c')]).toEqual(['1', '2', '3']);
  });

  test('[F1.2] pm.request url/headers changed by a pre-request script are what gets sent', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { preRequestScript: "pm.request.url = pm.request.url + '?scripted=1'; pm.request.headers['X-Scripted'] = 'yes';" });
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(seen.at(-1)!.url).toContain('scripted=1');
    expect(seen.at(-1)!.headers['x-scripted']).toBe('yes');
  });

  test('[F1.4] pm.environment.unset removes the variable before {{var}} is resolved', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { url: 'https://mock.test/x?q={{f14var}}', preRequestScript: "pm.environment.unset('f14var');" }, [envVar('f14var', 'seedval')]);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(decodeURIComponent(seen.at(-1)!.url)).not.toContain('seedval');
  });

  test('[F2.2] pm.response json()/text()/headers.get()/code/responseTime work; bad JSON throws inside pm.test', async ({ page }) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    await page.route('https://mock.test/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"a":{"b":7}}', headers: { ...cors, 'x-custom': 'cv' } });
    });
    await scene(page, {
      testScript: [
        "pm.test('json', () => pm.expect(pm.response.json().a.b).to.equal(7));",
        "pm.test('text', () => pm.expect(pm.response.text()).to.include('\"b\":7'));",
        "pm.test('header', () => pm.expect(pm.response.headers.get('X-Custom')).to.equal('cv'));",
        "pm.test('code', () => pm.expect(pm.response.code).to.equal(200));",
        "pm.test('time', () => pm.expect(pm.response.responseTime).to.be.a('number'));",
        "pm.test('bad json handled', () => { pm.expect(() => JSON.parse('{x')).to.throw(); });",
      ].join('\n'),
    });
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    await page.getByTestId('response-tab-test_results').click();
    const items = page.getByTestId('test-result-item');
    await expect(items).toHaveCount(6);
    for (let i = 0; i < 6; i++) await expect(items.nth(i).getByTestId('test-result-status')).toHaveText('PASS');
  });

  test('[F4.6] console.log of circular objects, Symbol, undefined and huge values does not crash the script', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, {
      preRequestScript: "const o={}; o.self=o; console.log(o, Symbol('s'), undefined, null, function(){}); console.log('x'.repeat(50000)); console.log('last-line-ran');",
    });
    await page.getByTestId('console-toggle-btn').click();
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(seen.length).toBe(1);
    await expect(page.getByTestId('console-drawer')).toContainText('last-line-ran');
  });

  test('[G5.2] pm.collectionVariables.set is usable by the same run (documented as run-scoped)', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { url: 'https://mock.test/x?cv={{cv}}', preRequestScript: "pm.collectionVariables.set('cv','run-val'); pm.test('get', () => pm.expect(pm.collectionVariables.get('cv')).to.equal('run-val'));" });
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(seen.at(-1)!.url).toContain('cv=run-val');
  });
});

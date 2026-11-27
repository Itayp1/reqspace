import { test, expect } from '../fixtures';
import { registerUser, treeNode } from '../helpers';
import { mockServer, scene } from '../scene';

// UX pass on the request editor screens (QA-08, QA-50, QA-57, script snippets, a11y names).
test.describe('request editor UX', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'requx');
    await page.getByTestId('new-tab-btn').click();
  });

  test('request sections are exposed as tabs and snippets as buttons', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Params' })).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('req-tab-pre-request-script').click();
    await expect(page.getByRole('button', { name: 'Get Environment Variable' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set request header (pre-request)' })).toBeVisible();
  });


  test('manual Content-Type with a form body type shows an ignored-header warning', async ({ page }) => {
    await page.getByTestId('req-tab-headers').click();
    await page.getByTestId('kv-key-0').fill('Content-Type');
    await page.getByTestId('req-tab-body').click();
    await expect(page.getByTestId('body-content-type-warning')).toHaveCount(0);
    await page.getByTestId('body-mode-urlencoded').click();
    await expect(page.getByTestId('body-content-type-warning')).toBeVisible();
  });

  test('URL bar icon buttons have names and the connection button is spelled out', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Generate code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save options' })).toBeVisible();
    await expect(page.getByTestId('new-connection-btn')).toHaveText('Connection');
  });

  test('code generation languages wrap instead of scrolling sideways', async ({ page }) => {
    await page.getByTestId('codegen-btn').click();
    await expect(page.getByTestId('codegen-lang-csharp')).toBeInViewport();
  });
});

test('request editor keeps a usable height with the console open', async ({ page }) => {
  await registerUser(page, 'layout');
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('console-toggle-btn').click();
  await expect(page.getByTestId('console-drawer')).toBeVisible();
  await expect(page.getByTestId('kv-key-0')).toBeInViewport();
  await expect(page.getByTestId('new-connection-btn')).toContainText('Conn');
});

test('empty raw body editor shows a placeholder that disappears once you type', async ({ page }) => {
  await registerUser(page, 'editor_ph');
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('req-tab-body').click();
  await page.getByTestId('body-mode-raw').click();
  const ph = page.getByTestId('editor-placeholder');
  await expect(ph).toBeVisible();
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.type('{}');
  await expect(ph).toBeHidden();
});


// QA-15: Ctrl+Enter in the URL bar sent the request twice (window shortcut + the input's Enter handler).
test('QA-15: Ctrl+Enter in the URL bar sends exactly once', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page);
  await page.getByTestId('request-url-input').click();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('response-status')).toContainText('200');
  await page.waitForTimeout(500);
  expect(seen.length).toBe(1);
});

test.describe('per-request settings', () => {
  const uniq = (p: string) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;

  test('[P2.5] the request editor has per-request settings that override the global ones', async ({ page }) => {
    await registerUser(page, 'p25');
    const wsId0 = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
    expect((await page.request.post(`/api/workspaces/${wsId0}/collections`, { data: { name: 'P25Col' } })).ok()).toBeTruthy();
    await page.reload();
    const name = uniq('p25');
    await page.getByTestId('create-request-btn').click(); // a collection exists: name prompt, saved request (QA-11)
    await page.getByTestId('prompt-input').fill(name);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('req-tab-settings')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('req-tab-settings').click();
    await page.getByTestId('req-setting-followRedirects').selectOption('false');
    await page.getByTestId('req-setting-timeout').fill('1234');
    // Saved on the request: persists across a reload of the stored request.
    await page.getByTestId('request-save-btn').click();
    await expect(treeNode(page, name)).toBeVisible();
    const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
    const cols = await (await page.request.get(`/api/workspaces/${wsId}/collections`)).json();
    const colId = (cols[0] ?? cols.collections?.[0])._id;
    const list = await (await page.request.get(`/api/collections/${colId}/requests`)).json();
    const saved = (Array.isArray(list) ? list : list.requests).find((r: any) => r.name === name);
    const full = await (await page.request.get(`/api/requests/${saved._id}`)).json();
    expect(full.settings).toMatchObject({ followRedirects: false, timeout: 1234 });
  });
});


/**
 * Moved from runner/runner-codegen-url.spec.ts (consolidation):
 * - An empty URL "succeeded" with 200 (fetch('') hits the app itself).
 * - Code snippets dropped url-encoded / form-data / GraphQL bodies.
 */
test.describe('Runner, empty URL, code snippets', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'rcu');
    await page.route('https://rcu.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  });

  test('sending with an empty URL is refused, and a scheme-less URL gets http://', async ({ page }) => {
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).not.toContainText('200');
    await expect(page.getByTestId('response-body-viewer')).toContainText('Enter a request URL');

    await page.route('http://rcu.example.test/**', (route) => route.fulfill({ status: 200, body: 'plain' }));
    await page.getByTestId('request-url-input').fill('rcu.example.test/noscheme');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
  });

  test('code snippets include url-encoded and form-data bodies', async ({ page }) => {
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('https://rcu.example.test/form');
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-urlencoded').click();
    await page.getByTestId('kv-key-0').fill('a');
    await page.getByTestId('kv-val-0').fill('1');
    await page.getByTestId('codegen-btn').click();
    await expect(page.getByTestId('codegen-code-block')).toContainText("--data-urlencode 'a=1'");
    await page.getByTestId('codegen-lang-go').click();
    await expect(page.getByTestId('codegen-code-block')).toContainText('strings.NewReader("a=1")');
  });
});

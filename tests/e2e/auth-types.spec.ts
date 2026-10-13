import { test, expect, type Page } from '@playwright/test';

/**
 * The auth types `requests.spec.ts` never covered: API key (header and query),
 * OAuth 2.0, and `inherit`.
 *
 * `inherit` needed the feature built first. Only `requests` had an `auth`
 * column, so `resolveInheritedAuth` walked the folder chain and the collection
 * and always found nothing — `inherit` silently behaved like `none`.
 * Migration 015 adds `auth` to `collections` and `folders`, and
 * GroupEditModal has an Authorization tab for it.
 *
 * Every assertion here runs AFTER `page.reload()`, so nothing can pass on
 * client-side state alone: the value has to have reached the server and come
 * back. `requestStore` deliberately strips auth secrets before persisting to
 * localStorage, which makes the reload a genuine round-trip check.
 */
test.describe('Auth types', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const EMAIL = `authtypes_${ts}@example.com`;
  const COLLECTION = `Auth Collection ${ts}`;
  const FOLDER = 'Auth Folder';

  async function login(page: Page) {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(EMAIL);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }

  function container(page: Page, nodeName: string) {
    return page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${nodeName}`) });
  }

  async function openMenu(page: Page, nodeName: string) {
    const node = container(page, nodeName);
    await node.hover();
    await node.getByTestId('action-menu-btn').click();
  }

  /** Reload, re-open the collection, and select the request by name. */
  async function reloadAndOpen(page: Page, requestName: string) {
    await page.reload();
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();
    await page.getByTestId(`node-${COLLECTION}`).click();
    const node = page.getByTestId(`node-${requestName}`);
    if (!(await node.isVisible().catch(() => false))) {
      await page.getByTestId(`node-${FOLDER}`).click();
    }
    await node.click();
    await page.getByTestId('req-tab-authorization').click();
  }

  test('set up a collection, a folder and requests', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Auth User');
    await page.getByTestId('register-email').fill(EMAIL);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill(COLLECTION);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();

    await openMenu(page, COLLECTION);
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill(FOLDER);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId(`node-${FOLDER}`)).toBeVisible();

    for (const name of ['ApiKey Header Req', 'ApiKey Query Req', 'OAuth Req']) {
      await openMenu(page, COLLECTION);
      await page.getByTestId('action-menu-new-request').click();
      await page.getByTestId('prompt-input').fill(name);
      await page.getByTestId('prompt-submit').click();
      await expect(page.getByTestId(`node-${name}`)).toBeVisible();
    }

    await openMenu(page, FOLDER);
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Inherit Req');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('prompt-input')).toBeHidden();
  });

  test('API key in a header persists through a reload and is sent', async ({ page }) => {
    await login(page);
    await page.getByTestId(`node-${COLLECTION}`).click();
    await page.getByTestId('node-ApiKey Header Req').click();

    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('apikey');
    await page.getByTestId('auth-apikey-key').fill('X-Api-Key');
    await page.getByTestId('auth-apikey-value').fill('secret-key-value');
    await expect(page.getByTestId('auth-apikey-in-header')).toBeChecked();
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    await reloadAndOpen(page, 'ApiKey Header Req');
    await expect(page.getByTestId('auth-type-select')).toHaveValue('apikey');
    await expect(page.getByTestId('auth-apikey-key')).toHaveValue('X-Api-Key');
    await expect(page.getByTestId('auth-apikey-value')).toHaveValue('secret-key-value');

    await page.route('**/echo', (route) => route.fulfill({ status: 200, body: 'ok' }));
    const sent = page.waitForRequest((r) => r.url().includes('/echo'));
    await page.getByTestId('request-send-btn').click();
    expect((await sent).headers()['x-api-key']).toBe('secret-key-value');
  });

  test('API key in the query string persists and lands in the URL', async ({ page }) => {
    await login(page);
    await page.getByTestId(`node-${COLLECTION}`).click();
    await page.getByTestId('node-ApiKey Query Req').click();

    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('apikey');
    await page.getByTestId('auth-apikey-key').fill('access_token');
    await page.getByTestId('auth-apikey-value').fill('query-token-123');
    await page.getByTestId('auth-apikey-in-query').check();
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    await reloadAndOpen(page, 'ApiKey Query Req');
    await expect(page.getByTestId('auth-apikey-key')).toHaveValue('access_token');
    // The radio choice has to survive too, not just the key/value pair.
    await expect(page.getByTestId('auth-apikey-in-query')).toBeChecked();

    await page.route('**/echo**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    const sent = page.waitForRequest((r) => r.url().includes('/echo'));
    await page.getByTestId('request-send-btn').click();
    const req = await sent;
    expect(req.url()).toContain('access_token=query-token-123');
    // A query-placed key must not also go out as a header.
    expect(req.headers()['access_token']).toBeUndefined();
  });

  test('OAuth 2.0 token persists and is sent as a bearer header', async ({ page }) => {
    await login(page);
    await page.getByTestId(`node-${COLLECTION}`).click();
    await page.getByTestId('node-OAuth Req').click();

    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('oauth2');
    await page.getByTestId('auth-oauth2-token').fill('oauth-access-token');
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    await reloadAndOpen(page, 'OAuth Req');
    await expect(page.getByTestId('auth-type-select')).toHaveValue('oauth2');
    await expect(page.getByTestId('auth-oauth2-token')).toHaveValue('oauth-access-token');

    await page.route('**/echo', (route) => route.fulfill({ status: 200, body: 'ok' }));
    const sent = page.waitForRequest((r) => r.url().includes('/echo'));
    await page.getByTestId('request-send-btn').click();
    expect((await sent).headers()['authorization']).toBe('Bearer oauth-access-token');
  });

  test('collection auth persists through a reload', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();

    await openMenu(page, COLLECTION);
    await page.getByTestId('action-menu-edit').click();
    await page.getByTestId('group-edit-auth-tab').click();
    // A collection has no parent, so Inherit isn't offered there.
    await expect(page.getByTestId('group-auth-editor').getByRole('option', { name: /Inherit/ })).toHaveCount(0);

    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('collection-level-token');
    await page.getByTestId('group-edit-save-btn').click();

    // Straight after a reload — this is the half that never existed before
    // migration 015, so the value had nowhere to be stored.
    await page.reload();
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();
    await openMenu(page, COLLECTION);
    await page.getByTestId('action-menu-edit').click();
    await page.getByTestId('group-edit-auth-tab').click();
    await expect(page.getByTestId('auth-type-select')).toHaveValue('bearer');
    await expect(page.getByTestId('auth-bearer-token')).toHaveValue('collection-level-token');
    await page.keyboard.press('Escape');
  });

  test('a request set to inherit sends the collection auth', async ({ page }) => {
    await login(page);
    await reloadAndOpen(page, 'Inherit Req');

    await page.getByTestId('auth-type-select').selectOption('inherit');
    await expect(page.getByTestId('req-tab-authorization')).toBeVisible();
    await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    await reloadAndOpen(page, 'Inherit Req');
    await expect(page.getByTestId('auth-type-select')).toHaveValue('inherit');

    await page.route('**/echo', (route) => route.fulfill({ status: 200, body: 'ok' }));
    const sent = page.waitForRequest((r) => r.url().includes('/echo'));
    await page.getByTestId('request-send-btn').click();
    // Inherited from the collection, two levels up through the folder.
    expect((await sent).headers()['authorization']).toBe('Bearer collection-level-token');
  });

  test('a folder auth overrides the collection it sits in', async ({ page }) => {
    await login(page);
    await page.getByTestId(`node-${COLLECTION}`).click();
    await expect(page.getByTestId(`node-${FOLDER}`)).toBeVisible();

    await openMenu(page, FOLDER);
    await page.getByTestId('action-menu-edit').click();
    // Folders have no Variables tab, so Authorization is the first one.
    await expect(page.getByTestId('group-edit-variables-tab')).toBeHidden();
    await page.getByTestId('group-edit-auth-tab').click();
    await page.getByTestId('auth-type-select').selectOption('basic');
    await page.getByTestId('auth-basic-username').fill('folderuser');
    await page.getByTestId('auth-basic-password').fill('folderpass');
    await page.getByTestId('group-edit-save-btn').click();

    await reloadAndOpen(page, 'Inherit Req');
    await expect(page.getByTestId('auth-type-select')).toHaveValue('inherit');

    await page.route('**/echo', (route) => route.fulfill({ status: 200, body: 'ok' }));
    const sent = page.waitForRequest((r) => r.url().includes('/echo'));
    await page.getByTestId('request-send-btn').click();
    // The folder is the nearer ancestor, so Basic wins over the collection's
    // Bearer.
    expect((await sent).headers()['authorization'])
      .toBe('Basic ' + Buffer.from('folderuser:folderpass').toString('base64'));
  });
});

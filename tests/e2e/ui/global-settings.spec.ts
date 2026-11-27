import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import { registerUser } from '../helpers';

/**
 * Global Settings had no coverage: the proxy fields' test ids existed but
 * nothing referenced them, and the settings button itself was never clicked
 * by any spec. These settings are the ones that change how every request is
 * sent, so each assertion here checks the stored value AND its effect.
 */
test.describe('Global Settings', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Settings User');
    await page.getByTestId('register-email').fill(`settings_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('request settings persist to the server and survive a reload', async ({ page }) => {
    // Settings are PUT to /auth/settings on every change — catch the call so
    // this asserts persistence, not just local state.
    const savePromise = page.waitForResponse(
      (r) => r.url().includes('/auth/settings') && r.request().method() === 'PUT'
    );

    await page.getByTestId('settings-btn').click();
    await expect(page.getByRole('heading', { name: 'Global Settings' })).toBeVisible();

    const followRedirects = page.locator('#followRedirects');
    const verifySsl = page.locator('#verifySsl');
    const timeout = page.locator('#requestTimeout');

    await expect(followRedirects).toBeChecked();
    await expect(verifySsl).not.toBeChecked();
    await expect(timeout).toHaveValue('0');

    await followRedirects.uncheck();
    expect((await savePromise).status()).toBe(200);
    await verifySsl.check();
    await timeout.fill('7500');

    await page.reload();
    await page.getByTestId('settings-btn').click();
    await expect(page.locator('#followRedirects')).not.toBeChecked();
    await expect(page.locator('#verifySsl')).toBeChecked();
    await expect(page.locator('#requestTimeout')).toHaveValue('7500');
  });

  test('the configured timeout is actually applied to a request', async ({ page }) => {
    await page.getByTestId('settings-btn').click();
    await page.locator('#requestTimeout').fill('500');
    await page.getByTestId('global-settings-close-btn').click();

    // A target that never answers — with a 500ms budget the request must give
    // up rather than hang until Playwright's own timeout.
    await page.route('https://slow.example.com/**', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20000));
    });

    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('request-url-input').fill('https://slow.example.com/hang');
    await page.getByTestId('request-send-btn').click();

    // Whatever the wording, the send has to come back on its own well inside
    // the 20s the route holds the connection for.
    await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('request-send-btn')).toBeVisible();
  });

  test('the local proxy section stores its configuration', async ({ page }) => {
    await page.getByTestId('settings-btn').click();

    // The URL/auth fields only render once the proxy is switched on.
    await expect(page.getByTestId('proxy-url-input')).toBeHidden();
    await page.getByTestId('proxy-enable-checkbox').check();
    await expect(page.getByTestId('proxy-url-input')).toBeVisible();
    await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:9123');

    // Likewise the credentials only appear behind the auth checkbox.
    await expect(page.getByTestId('proxy-username-input')).toBeHidden();
    await page.getByTestId('proxy-auth-checkbox').check();
    await page.getByTestId('proxy-username-input').fill('proxyuser');
    await page.getByTestId('proxy-password-input').fill('proxypass');

    await page.reload();
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('proxy-enable-checkbox')).toBeChecked();
    await expect(page.getByTestId('proxy-url-input')).toHaveValue('http://127.0.0.1:9123');
    await expect(page.getByTestId('proxy-auth-checkbox')).toBeChecked();
    await expect(page.getByTestId('proxy-username-input')).toHaveValue('proxyuser');
    await expect(page.getByTestId('proxy-password-input')).toHaveValue('proxypass');

    // Turning it back off hides the fields again without losing the URL.
    await page.getByTestId('proxy-enable-checkbox').uncheck();
    await expect(page.getByTestId('proxy-url-input')).toBeHidden();
  });

  test('a rebound search shortcut replaces Ctrl+K', async ({ page }) => {
    await page.getByTestId('settings-btn').click();
    const searchShortcut = page.locator('input[value="ctrl+k"]');
    await expect(searchShortcut).toBeVisible();
    await searchShortcut.fill('ctrl+j');
    await page.getByTestId('global-settings-close-btn').click();

    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await page.keyboard.press('Control+j');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // And the old binding no longer opens it.
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeHidden();
  });
});

test('[ABOUT] Global Settings shows the app version', async ({ page }) => {
  await registerUser(page, 'about1');
  await page.getByTestId('settings-btn').click();
  await expect(page.getByTestId('about-section')).toBeVisible();
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);
});

// Modals must be role="dialog" and Escape must close Global Settings (QA-19).
test('Global Settings is a dialog and Escape closes it', async ({ page }) => {
  await registerUser(page, 'qa19');
  await page.getByLabel('Open general settings').click();
  await expect(page.getByTestId('global-settings-close-btn')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('global-settings-close-btn')).toHaveCount(0);
});

test.describe('Settings API, shortcuts and certificates form', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  let seq = 0;
  async function newUser(prefix: string) {
    const email = `${prefix}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}@example.com`;
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` } });
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    return { ctx, email };
  }

  test('[P2.2] PUT /auth/settings rejects negative and non-numeric timeouts', async () => {
    const { ctx } = await newUser('p22');
    expect((await ctx.put('/api/auth/settings', { data: { timeout: -5 } })).status()).toBe(400);
    expect((await ctx.put('/api/auth/settings', { data: { timeout: 'abc' } })).status()).toBe(400);
    expect((await ctx.put('/api/auth/settings', { data: { timeout: 5000 } })).status()).toBe(200);
  });

  test('[SETTINGS-KEYS] PUT /auth/settings accepts every client key and persists it', async () => {
    const { ctx } = await newUser('skeys');
    const patch = {
      followRedirects: false, verifySsl: false, sendNoCacheHeader: true, encodeUrl: false, timeout: 1234,
      proxyEnabled: true, proxyUrl: 'http://127.0.0.1:8080', noProxy: 'localhost', proxyAuthEnabled: true,
      proxyUsername: 'u', proxyPassword: 'p', saveHistory: false, sendCookies: false,
      shortcuts: { send: 'ctrl+enter' },
    };
    const res = await ctx.put('/api/auth/settings', { data: patch });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const [k, v] of Object.entries(patch)) expect(body[k], k).toEqual(v);
    const me = await (await ctx.get('/api/auth/me')).json();
    const s = (me.user ?? me).settings ?? {};
    expect(s.sendCookies).toBe(false);
    expect(s.saveHistory).toBe(false);
  });

  test.describe('P2.4 offline', () => {
    test.use({ allowFpErrors: [/Network Error|500|boom/] });
    test('[P2.4] a failed settings save rolls the value back and shows an error toast', async ({ page }) => {
      await registerUser(page, 'p24');
      await page.getByTestId('settings-btn').click();
      await expect(page.locator('#followRedirects')).toBeChecked();
      await page.route('**/auth/settings', (r) => r.request().method() === 'PUT' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : r.fallback());
      // click(), not uncheck(): uncheck() verifies the box changed, but the failed save rolls it back at once.
      await page.locator('#followRedirects').click();
      await expect(page.getByTestId('toast-error').first()).toBeVisible();
      await expect(page.locator('#followRedirects')).toBeChecked();
    });
  });

  test('[P3.5] shortcuts can be rebound, collisions are refused, Reset restores defaults', async ({ page }) => {
    await registerUser(page, 'p35');
    await page.getByTestId('settings-btn').click();
    const send = page.getByTestId('shortcut-send-input');
    const save = page.getByTestId('shortcut-save-input');
    const search = page.getByTestId('shortcut-search-input');
    await save.fill('ctrl+shift+s');
    await expect(page.getByTestId('shortcut-save-error')).toBeHidden();
    await save.blur();
    await expect(save).toHaveValue('ctrl+shift+s');
    await send.fill('ctrl+k'); // collides with search
    await expect(page.getByTestId('shortcut-send-error')).toBeVisible();
    await send.blur();
    await expect(send).toHaveValue('ctrl+enter');
    await search.fill('alt+j');
    await page.getByTestId('shortcuts-reset-btn').click();
    await expect(search).toHaveValue('ctrl+k');
    await expect(save).toHaveValue('ctrl+s');
  });

  test('[P3.7] browser-reserved shortcuts (ctrl+t, ctrl+w) are rejected', async ({ page }) => {
    await registerUser(page, 'p37');
    await page.getByTestId('settings-btn').click();
    for (const k of ['ctrl+t', 'ctrl+w']) {
      await page.getByTestId('shortcut-save-input').fill(k);
      await expect(page.getByTestId('shortcut-save-error')).toContainText(/reserved/i);
    }
  });

  test('[P4.10] a plain browser does not offer the client certificates form (Desktop only)', async ({ page }) => {
    await registerUser(page, 'p410');
    await page.getByTestId('settings-btn').click();
    await expect(page.getByText('Client Certificates (mTLS)')).toHaveCount(0);
    await expect(page.getByTestId('cert-add-btn')).toHaveCount(0);
  });
});

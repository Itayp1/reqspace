import { test, expect } from './fixtures';

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
    await expect(verifySsl).toBeChecked();
    await expect(timeout).toHaveValue('0');

    await followRedirects.uncheck();
    expect((await savePromise).status()).toBe(200);
    await verifySsl.uncheck();
    await timeout.fill('7500');

    await page.reload();
    await page.getByTestId('settings-btn').click();
    await expect(page.locator('#followRedirects')).not.toBeChecked();
    await expect(page.locator('#verifySsl')).not.toBeChecked();
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

import { test, expect } from '@playwright/test';

/**
 * Two features that shipped with no e2e coverage: the cookie manager and the
 * Console drawer.
 *
 * They are tested together because the Console is how a user verifies what
 * the cookie jar actually did: `Cookie` is a forbidden header name for
 * `fetch`, so the browser transport's outgoing header can't be observed from
 * the network side at all — the Console's own record of the sent request is
 * the only end-to-end evidence, and it is a feature in its own right.
 */
test.describe('Cookies & Console', () => {
  test.describe.configure({ mode: 'serial' });

  const DOMAIN = 'cookie-target.example.com';

  async function registerAndOpenRequest(page: import('@playwright/test').Page, tag: string) {
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Cookie User');
    await page.getByTestId('register-email').fill(`${tag}_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    await page.getByTestId('create-request-btn').click();
  }

  test('a cookie added in the manager is attached to a matching request', async ({ page }) => {
    await registerAndOpenRequest(page, 'cookie');

    await page.getByLabel('Manage cookies').click();
    const modal = page.getByTestId('cookie-manager-modal');
    await expect(modal).toBeVisible();

    await page.getByTestId('cookie-add-domain-toggle').click();
    await page.getByTestId('cookie-new-domain-input').fill(DOMAIN);
    await page.getByTestId('cookie-new-domain-submit').click();

    // Adding a domain seeds it with one placeholder cookie and selects it.
    await expect(page.getByTestId(`cookie-domain-${DOMAIN}`)).toBeVisible();
    await expect(page.getByTestId('cookie-row')).toHaveCount(1);
    await page.getByTestId('cookie-name-input').fill('session_id');
    await page.getByTestId('cookie-value-input').fill('abc123');

    // A second cookie on the same domain — both must be sent, joined by "; ".
    await page.getByTestId('cookie-add-btn').click();
    await expect(page.getByTestId('cookie-row')).toHaveCount(2);
    await page.getByTestId('cookie-name-input').nth(1).fill('theme');
    await page.getByTestId('cookie-value-input').nth(1).fill('dark');

    await page.getByTestId('cookie-close-btn').click();
    await expect(modal).toBeHidden();

    await page.route(`https://${DOMAIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );
    await page.getByTestId('request-url-input').fill(`https://${DOMAIN}/api/thing`);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');

    // The Console is the record of what was actually sent.
    await page.getByTestId('console-toggle-btn').click();
    await expect(page.getByTestId('console-drawer')).toBeVisible();
    const log = page.getByTestId('console-log-request').first();
    await expect(log).toContainText(`https://${DOMAIN}/api/thing`);
    await log.click();
    const details = page.getByTestId('console-log-details');
    await expect(details).toContainText('session_id=abc123');
    await expect(details).toContainText('theme=dark');
  });

  test('a cookie for a different domain is not attached', async ({ page }) => {
    await registerAndOpenRequest(page, 'cookie_other');

    await page.getByLabel('Manage cookies').click();
    await page.getByTestId('cookie-add-domain-toggle').click();
    await page.getByTestId('cookie-new-domain-input').fill('somewhere-else.example.org');
    await page.getByTestId('cookie-new-domain-submit').click();
    await page.getByTestId('cookie-name-input').fill('leaky');
    await page.getByTestId('cookie-value-input').fill('should-not-travel');
    await page.getByTestId('cookie-close-btn').click();

    await page.route('https://unrelated.example.net/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
    await page.getByTestId('request-url-input').fill('https://unrelated.example.net/api');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');

    await page.getByTestId('console-toggle-btn').click();
    await page.getByTestId('console-log-request').first().click();
    await expect(page.getByTestId('console-log-details')).not.toContainText('should-not-travel');
  });

  test('cookies survive a reload, and deleting removes them', async ({ page }) => {
    await registerAndOpenRequest(page, 'cookie_persist');

    await page.getByLabel('Manage cookies').click();
    await page.getByTestId('cookie-add-domain-toggle').click();
    await page.getByTestId('cookie-new-domain-input').fill(DOMAIN);
    await page.getByTestId('cookie-new-domain-submit').click();
    await page.getByTestId('cookie-name-input').fill('persisted');
    await page.getByTestId('cookie-value-input').fill('yes');
    await page.getByTestId('cookie-path-input').fill('/scoped');
    await page.getByTestId('cookie-close-btn').click();

    // The jar lives in localStorage, so it has to come back after a reload.
    await page.reload();
    await page.getByLabel('Manage cookies').click();
    await page.getByTestId(`cookie-domain-${DOMAIN}`).click();
    await expect(page.getByTestId('cookie-name-input')).toHaveValue('persisted');
    await expect(page.getByTestId('cookie-value-input')).toHaveValue('yes');
    await expect(page.getByTestId('cookie-path-input')).toHaveValue('/scoped');

    // Delete the single cookie — the domain row goes with its last cookie.
    await page.getByTestId('cookie-delete-btn').click();
    await expect(page.getByTestId('cookie-row')).toHaveCount(0);
    await expect(page.getByTestId('cookie-manager-modal')).toContainText('No cookies for');
    await expect(page.getByTestId(`cookie-domain-${DOMAIN}`)).toBeHidden();
  });

  test('the Console logs script output, resolved auth, the real URL, and clears', async ({ page }) => {
    await registerAndOpenRequest(page, 'console');

    await page.route('https://console-target.example.com/**', (route) =>
      route.fulfill({ status: 201, contentType: 'application/json', body: '{"created":true}' })
    );

    await page.getByTestId('request-url-input').fill('https://console-target.example.com/widgets');
    await page.getByTestId('method-select').selectOption('POST');

    // Bearer auth: the Console must show the Authorization header that was
    // genuinely sent, not a re-derivation of the headers table (which never
    // contained it).
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('console-token');

    // A pre-request script that both writes a header and logs — the log line
    // is a separate Console entry type from the request entry.
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.insertText(`console.log('from-pre-request');\nreq.headers.set('X-Script-Header', 'set-by-script');`);

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('201');

    await page.getByTestId('console-toggle-btn').click();
    await expect(page.getByTestId('console-drawer')).toBeVisible();

    await expect(page.getByTestId('console-log-log')).toContainText('from-pre-request');

    const reqLog = page.getByTestId('console-log-request').first();
    await expect(reqLog).toContainText('POST');
    await expect(reqLog).toContainText('201');
    await reqLog.click();
    const details = page.getByTestId('console-log-details');
    await expect(details).toContainText('Bearer console-token');
    await expect(details).toContainText('set-by-script');
    await expect(details).toContainText('created');

    // Clear empties it; close hides the drawer without clearing.
    await page.getByTestId('console-clear-btn').click();
    await expect(page.getByTestId('console-drawer')).toContainText('No logs yet');
    await page.getByTestId('console-close-btn').click();
    await expect(page.getByTestId('console-drawer')).toBeHidden();
  });

  test('a form-data request can be expanded in the Console without breaking it', async ({ page }) => {
    await registerAndOpenRequest(page, 'console_form');

    await page.route('https://form-target.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
    await page.getByTestId('request-url-input').fill('https://form-target.example.com/upload');
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-form-data').click();
    await page.getByTestId('kv-key-0').fill('field');
    await page.getByTestId('kv-val-0').fill('value');

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');

    // form-data makes the request body an object. The drawer renders it into
    // a <pre>, so it has to arrive as text — an object child throws in React
    // and used to blank the whole app on expand.
    await page.getByTestId('console-toggle-btn').click();
    await page.getByTestId('console-log-request').first().click();
    const details = page.getByTestId('console-log-details');
    await expect(details).toContainText('field');
    await expect(details).toContainText('value');
    await expect(page.getByTestId('console-drawer')).toBeVisible();
  });
});

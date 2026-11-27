import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { registerUser } from '../helpers';
import { registerAndOpenRequest, seedRequest } from './seed';

test.describe('Cookies & Console', () => {
  const DOMAIN = 'cookie-target.example.com';

  test('a cookie added in the manager is attached to a matching request', async ({ page }) => {
    await registerAndOpenRequest(page, 'cookie');

    await page.getByLabel('Manage cookies').first().click();
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
    await page.getByTestId('console-reveal-btn').click(); // cookies are masked in the Console until revealed
    const details = page.getByTestId('console-log-details');
    await expect(details).toContainText('session_id=abc123');
    await expect(details).toContainText('theme=dark');
  });

  test('a cookie for a different domain is not attached', async ({ page }) => {
    await registerAndOpenRequest(page, 'cookie_other');

    await page.getByLabel('Manage cookies').first().click();
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

    await page.getByLabel('Manage cookies').first().click();
    await page.getByTestId('cookie-add-domain-toggle').click();
    await page.getByTestId('cookie-new-domain-input').fill(DOMAIN);
    await page.getByTestId('cookie-new-domain-submit').click();
    await page.getByTestId('cookie-name-input').fill('persisted');
    await page.getByTestId('cookie-value-input').fill('yes');
    await page.getByTestId('cookie-path-input').fill('/scoped');
    await page.getByTestId('cookie-close-btn').click();

    // The jar lives in localStorage, so it has to come back after a reload.
    await page.reload();
    await page.getByLabel('Manage cookies').first().click();
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
});

/** "Send Cookies Automatically" used to be on for every new user. */
test('"Send Cookies Automatically" is off by default', async ({ page }) => {
  await registerUser(page, 'cookiedef');
  await page.getByTestId('settings-btn').click();
  await expect(page.locator('#sendCookies')).not.toBeChecked();
});


/**
 * [D12.1] A response with Set-Cookie is captured into the cookie jar, shown in the
 * Cookies tab / cookie manager, and the next request to that host sends it back.
 *
 * WHAT IS (NOT) AUTOMATABLE: the web build sends requests with a plain browser
 * fetch(), and the Fetch standard classifies Set-Cookie as a forbidden response
 * header, so JS never sees it - this is a platform limit, not an app bug (there is
 * no server-side proxy transport). Set-Cookie is only exposed by the Electron
 * (httpRequest.js keeps it as an array) and Chrome-extension (webRequest, see
 * extension/background.js) transports. Those can't be loaded under Playwright, so
 * this test emulates the desktop transport contract: it installs a fake
 * `window.electron.sendRequest` that returns `headers['set-cookie']` as an array
 * exactly like electron/httpRequest.js. Everything downstream of the transport
 * (UrlBar -> cookie store -> Cookies tab -> cookie manager -> Cookie request
 * header) is the real app code. The real-extension leg was verified manually
 * (MANUAL_TEST_PLAN.md D12.1); the raw capture inside the extension/Electron
 * process is not covered here.
 */
test('[D12.1] Set-Cookie from a response is captured into the jar, shown, and sent on the next request', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__sent = [];
    w.electron = {
      sendRequest: async (payload: any) => {
        w.__sent.push(payload);
        const first = w.__sent.length === 1;
        return {
          status: 200, statusText: 'OK', isBase64: false, responseTime: 5, size: 2, body: 'ok',
          headers: first
            ? {
                'content-type': 'text/plain',
                'set-cookie': [
                  'sid=abc123; Path=/; HttpOnly',
                  'theme=dark; Path=/prefs; Max-Age=3600',
                  'sec=topsecret; Path=/; Secure',
                  'dom_c=hello; Domain=cookie.test; Path=/',
                ],
              }
            : { 'content-type': 'text/plain' },
        };
      },
      abortRequest: () => {},
    };
  });

  await registerUser(page, 'd121');
  await page.request.put('/api/auth/settings', { data: { sendCookies: true } }); // off by default
  await page.reload();
  await page.getByTestId('create-request-btn').click();
  const url = page.getByTestId('request-url-input');
  await expect(url).toBeVisible();

  await url.fill('http://cookie.test/login');
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 15000 });

  // Response "Cookies" tab lists them with attributes.
  await page.getByTestId('response-tab-cookies').click();
  const table = page.locator('table').filter({ hasText: 'HttpOnly' }).last();
  await expect(table).toContainText('sid');
  await expect(table).toContainText('abc123');
  await expect(table).toContainText('theme');
  await expect(table).toContainText('/prefs');
  await expect(table).toContainText('dom_c');

  // Stored in the jar (visible in the cookie manager, per domain).
  await page.locator('button[aria-label="Manage cookies"]').click();
  await expect(page.getByTestId('cookie-manager-modal')).toBeVisible();
  await expect(page.getByTestId('cookie-domain-cookie.test')).toBeVisible();
  await page.getByTestId('cookie-domain-cookie.test').click();
  await expect(page.getByTestId('cookie-row')).toHaveCount(4);
  const names = await page.getByTestId('cookie-name-input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).sort());
  expect(names).toEqual(['dom_c', 'sec', 'sid', 'theme']);
  await page.getByTestId('cookie-close-btn').click();

  // The next request to the host sends the matching ones (path-matched, no Secure over http).
  await url.fill('http://cookie.test/next');
  await page.getByTestId('request-send-btn').click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent.length)).toBe(2);
  const second = await page.evaluate(() => (window as any).__sent[1]);
  const cookieHeader: string = second.headers.Cookie || second.headers.cookie || '';
  expect(cookieHeader).toContain('sid=abc123');
  expect(cookieHeader).toContain('dom_c=hello');
  expect(cookieHeader).not.toContain('theme=dark'); // Path=/prefs does not match /next
  expect(cookieHeader).not.toContain('sec=topsecret'); // Secure not sent over http
});


/**
 * [I2.2] The response Cookies tab shows cookies from Set-Cookie and stays in sync with the cookie jar (D12).
 *
 * Why this was marked "not automatable": a plain browser fetch() can never read Set-Cookie (forbidden response
 * header), so the BrowserTransport never yields it. page.route cannot change that. BUT the app only needs the
 * transport to hand back `headers['set-cookie']`; the extension transport does so via window.postMessage. This
 * test therefore emulates the extension's content script (PING/PONG + SEND/RESPONSE) with addInitScript, which
 * drives the real UrlBar -> cookie jar ingest -> ResponseViewer path.
 * NOT covered here (needs the real extension/desktop app): the extension actually extracting Set-Cookie from the
 * network response and the real Cookie header being attached on the wire.
 */

async function fakeExtension(page: Page) {
  await page.addInitScript(() => {
    (window as any).__setCookies = [
      'sid=abc123; Path=/; Domain=.mock.test; HttpOnly; Secure',
      'theme=dark; Path=/',
    ];
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.source !== 'reqspace-client') return;
      if (e.data.type === 'REQSPACE_PING') {
        window.postMessage({ source: 'reqspace-extension', type: 'REQSPACE_PONG', version: 'test' }, '*');
      } else if (e.data.type === 'REQSPACE_SEND') {
        window.postMessage({
          source: 'reqspace-extension', type: 'REQSPACE_RESPONSE', id: e.data.id,
          response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json', 'set-cookie': (window as any).__setCookies }, body: '{"ok":true}', time: 5, size: 11 },
        }, '*');
      }
    });
  });
}


test('[I2.2] Cookies tab lists Set-Cookie cookies, matches the jar, and drops cookies the response deletes', async ({ page }) => {
  await fakeExtension(page);
  await seedRequest(page, 'i22', 'https://mock.test/x');

  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  await page.getByTestId('response-tab-cookies').click();

  const panel = page.locator('table:has(th:text("HttpOnly"))');
  const sid = panel.locator('tbody tr', { hasText: 'sid' });
  await expect(sid).toContainText('abc123');
  await expect(sid).toContainText('mock.test');
  await expect(sid).toContainText('✓'); // HttpOnly / Secure flags parsed
  await expect(panel.locator('tbody tr', { hasText: 'theme' })).toContainText('dark');
  // A leading-dot Domain must not produce a duplicate row next to the jar's copy (sync with the jar).
  await expect(panel.locator('tbody tr', { hasText: 'sid' })).toHaveCount(1);
  await expect(panel.locator('tbody tr', { hasText: 'theme' })).toHaveCount(1);

  // The same cookies are in the jar (Manage Cookies).
  await page.getByRole('button', { name: 'Manage Cookies' }).last().click();
  await page.getByTestId('cookie-domain-mock.test').click();
  await expect(page.getByTestId('cookie-name-input')).toHaveCount(2);
  await page.getByTestId('cookie-close-btn').click();

  // Second response deletes "theme" (Max-Age=0): gone from the tab and from the jar.
  await page.evaluate(() => { (window as any).__setCookies = ['theme=; Path=/; Max-Age=0']; });
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  await page.getByTestId('response-tab-cookies').click();
  await expect(panel.locator('tbody tr', { hasText: 'sid' })).toHaveCount(1);
  await expect(panel.locator('tbody tr', { hasText: 'theme' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage Cookies' }).last().click();
  await page.getByTestId('cookie-domain-mock.test').click();
  await expect(page.getByTestId('cookie-name-input')).toHaveCount(1);
});

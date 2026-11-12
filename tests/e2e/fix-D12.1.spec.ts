import { test, expect } from './fixtures';
import { registerUser } from './helpers';

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

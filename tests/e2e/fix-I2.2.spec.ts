import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';
import { registerUser } from './helpers';

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
  await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
  await registerUser(page, 'i22');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const col = await (await page.request.post(`/api/workspaces/${ws.id ?? ws._id}/collections`, { data: { name: 'Col' } })).json();
  const r = await page.request.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'Req', method: 'GET', url: 'https://mock.test/x' } });
  expect(r.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await page.getByTestId('node-Col').click();
  await page.getByTestId('node-Req').click();

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

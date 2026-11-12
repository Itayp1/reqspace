import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { registerUser } from './helpers';

/**
 * I2.1 (finding 25): the response Headers tab must show every header, including repeated ones
 * (several Set-Cookie), one row per value.
 *
 * What is testable in the web build:
 *  - The viewer/tab-count logic: when the transport hands back a repeated header as an array
 *    (which the desktop/extension transports do), each value gets its own row and the tab count
 *    counts rows. We exercise this by injecting a fake `window.electron.sendRequest` (getTransport()
 *    picks ElectronTransport when `window.electron` exists), returning real arrays.
 *  - Under the plain browser transport, ordinary headers are listed (count + rows).
 *
 * NOT testable in the web build: a real duplicate Set-Cookie off the wire. Browser fetch() hides
 * Set-Cookie entirely (forbidden response header) and merges other duplicates with ", ", and
 * page.route fulfill() cannot emit duplicate headers either. The real-wire path needs the
 * extension (extension/background.js sets headers['set-cookie'] = array) or the Electron main process.
 */

async function openRequest(page: Page) {
  await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
  await registerUser(page, 'i21');
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
}

test.describe('[I2.1] response Headers tab', () => {
  test('[I2.1] repeated headers (array values) are listed one row per value and counted', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).electron = {
        sendRequest: async () => ({
          status: 200, statusText: 'OK', isBase64: false, responseTime: 5, size: 2, body: '{}',
          headers: {
            'content-type': 'application/json',
            'set-cookie': ['a=1; Path=/', 'b=2; Path=/', 'c=3; Path=/'],
          },
        }),
        abortRequest: () => {},
      };
    });
    await openRequest(page);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    const tab = page.getByTestId('response-tab-headers');
    await expect(tab).toContainText('(4)'); // 1 content-type + 3 Set-Cookie rows
    await tab.click();
    const rows = page.locator('tbody tr').filter({ hasText: 'set-cookie' });
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('a=1');
    await expect(rows.nth(1)).toContainText('b=2');
    await expect(rows.nth(2)).toContainText('c=3');
  });

  test('[I2.1] web transport lists the (CORS-exposed) response headers', async ({ page }) => {
    await page.route('https://mock.test/**', async (route) => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { ...cors, 'x-one': '1', 'x-two': '2' } });
    });
    await openRequest(page);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    await page.getByTestId('response-tab-headers').click();
    await expect(page.locator('tbody tr').filter({ hasText: 'x-one' })).toHaveCount(1);
    await expect(page.locator('tbody tr').filter({ hasText: 'x-two' })).toHaveCount(1);
  });
});

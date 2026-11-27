import http from 'node:http';
import { statSync } from 'node:fs';
import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';
import { scene } from '../scene';
import { seedRequest } from './seed';

test.describe('Response & Code Gen', () => {
  test('Test Results and Code Generation Modal', async ({ page }) => {
    const testEmail = `response_${Date.now()}@example.com`;
    // Register
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Response User');
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', 'password');
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/.*\/$/);

    await page.getByTestId('create-request-btn').click();

    // Go to "Tests" tab in request editor
    await page.getByTestId('req-tab-tests').click();

    // Write a script pm.test(...)
    // The Monaco editor is tricky to type into directly, usually we use evaluate or click and type
    await page.locator('[data-testid="monaco-editor-container"] .monaco-editor').first().click();
    await page.keyboard.type('pm.test("Status 200", () => { pm.expect(pm.response.code).to.equal(200); });');

    // Send request
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');
    await page.click('[data-testid="request-send-btn"]');
    // Real HTTP/2 responses (as httpbin.org serves) have no reason phrase.
    await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 15000 });

    // Check Test Results tab
    await page.click('[data-testid="response-tab-test_results"]');
    const testResultItem = page.locator('[data-testid="test-result-item"]');
    await expect(testResultItem).toBeVisible();
    await expect(testResultItem.locator('[data-testid="test-result-status"]')).toHaveText('PASS');
    await expect(testResultItem.locator('[data-testid="test-result-name"]')).toHaveText('Status 200');

    // Click Code Generation
    await page.click('[data-testid="codegen-btn"]');
    
    // Verify Modal
    const codeGenModal = page.locator('[data-testid="codegen-modal"]');
    await expect(codeGenModal).toBeVisible();

    // Check Curl
    await page.click('[data-testid="codegen-lang-curl"]');
    await expect(page.locator('[data-testid="codegen-code-block"]')).toContainText('curl -X GET \'https://httpbin.org/get\'');

    // Check Python
    await page.click('[data-testid="codegen-lang-python-requests"]');
    await expect(page.locator('[data-testid="codegen-code-block"]')).toContainText('import requests');
  });

  test('per-mode viewer, image/PDF, timeout and error paths', async ({ page }) => {
    // Register
    const timestamp = Date.now();
    const testEmail = `viewer_${timestamp}@example.com`;
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Viewer User');
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', 'password');
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/.*\/$/);

    // Mock the actual targets — there is no server-side proxy relay, the
    // browser transport does a direct fetch(url), so mocks have to match
    // the real request URLs and return real response bodies (not a JSON
    // envelope) with correct Content-Type headers so the transport's own
    // binary/base64 detection kicks in as it would for a real server.
    await page.route('https://mock.com/json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'hello JSON' }),
    }));
    await page.route('https://mock.com/html', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<h1>Hello HTML</h1>',
    }));
    await page.route('https://mock.com/image', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    }));
    await page.route('https://mock.com/pdf', route => route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('JVBERi0xLg==', 'base64'),
    }));
    await page.route('https://mock.com/timeout', route => route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Gateway Timeout' }),
    }));

    await page.getByTestId('create-request-btn').click();

    // 1. JSON (pretty and raw)
    await page.getByTestId('request-url-input').fill('https://mock.com/json');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('200 OK');
    await expect(page.locator('.monaco-editor').first()).toBeVisible();
    await page.click('button:has-text("raw")');
    await expect(page.locator('.monaco-editor').first()).toBeVisible();

    // 2. HTML (preview)
    await page.getByTestId('request-url-input').fill('https://mock.com/html');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('200 OK');
    await page.click('button:has-text("preview")');
    await expect(page.locator('iframe[title="Response HTML Preview"]')).toBeVisible();

    // 3. Image
    await page.getByTestId('request-url-input').fill('https://mock.com/image');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.locator('img[alt="Response"]')).toBeVisible();

    // 4. PDF
    await page.getByTestId('request-url-input').fill('https://mock.com/pdf');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.locator('object[type="application/pdf"]')).toBeVisible();

    // 5. Timeout/Error
    await page.getByTestId('request-url-input').fill('https://mock.com/timeout');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('504');
    await page.click('button:has-text("pretty")');
    await expect(page.locator('.monaco-editor').first()).toBeVisible();
  });
});

const BODY = { a: { b: [{ n: 'ALPHA' }, { n: 'BRAVO' }] }, items: [{ id: 'ID_ONE' }, { id: 'ID_TWO', sub: { id: 'ID_DEEP' } }], other: 'NOPE_VALUE' };

async function mockJsonServer(page: Page) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  await page.route('https://mock.test/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BODY), headers: cors });
  });
}

test('[I2.4] JSON Path filter supports recursive ($..id) and wildcard ($.a.b[*]) expressions', async ({ page }) => {
  await mockJsonServer(page);
  await seedRequest(page, 'i24', 'https://mock.test/x');
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');

  const viewer = page.getByTestId('response-body-viewer');
  const filter = page.getByPlaceholder('Filter JSON...');

  await filter.fill('$..id');
  await expect(viewer).toContainText('ID_DEEP');
  await expect(viewer).toContainText('ID_ONE');
  await expect(viewer).not.toContainText('NOPE_VALUE');
  await expect(viewer).not.toContainText('Invalid JSON path');

  await filter.fill('$.a.b[*]');
  await expect(viewer).toContainText('ALPHA');
  await expect(viewer).toContainText('BRAVO');
  await expect(viewer).not.toContainText('No match');
  await expect(viewer).not.toContainText('Invalid JSON path');
});

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
    await seedRequest(page, 'i21', 'https://mock.test/x');
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
    await seedRequest(page, 'i21', 'https://mock.test/x');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    await page.getByTestId('response-tab-headers').click();
    await expect(page.locator('tbody tr').filter({ hasText: 'x-one' })).toHaveCount(1);
    await expect(page.locator('tbody tr').filter({ hasText: 'x-two' })).toHaveCount(1);
  });
});

test('a 100MB JSON response shows "too large", keeps the page responsive and saves to a file', async ({ page }) => {
  test.setTimeout(240_000);
  // A real server: Playwright's route.fulfill cannot carry 100MB over its debug pipe.
  const item = JSON.stringify({ id: 1, name: 'x'.repeat(90), tags: ['a', 'b', 'c'] });
  const big = '[' + Array(Math.ceil(100 * 1024 * 1024 / (item.length + 1))).fill(item).join(',') + ']';
  const srv = http.createServer((_q, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(big);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(srv.address() as any).port}/big`;

  try {
    await seedRequest(page, 'bigresp', url);
    await page.getByTestId('request-send-btn').click();

    await expect(page.getByText('Response too large')).toBeVisible({ timeout: 120_000 });
    // The main thread must not be frozen by a JSON.parse/stringify of the whole body.
    const t0 = Date.now();
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => res(null))));
    expect(Date.now() - t0).toBeLessThan(2000);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByTestId('large-response-save').click(),
    ]);
    expect(statSync(await download.path()).size).toBeGreaterThan(90 * 1024 * 1024);
  } finally {
    srv.close();
  }
});

// QA-55 / QA-78: dragging the request/response splitter resizes the panes and selects no text.
test('QA-55: dragging the splitter up makes the response pane taller', async ({ page }) => {
  await scene(page);
  const pane = page.getByTestId('response-pane');
  const before = (await pane.boundingBox())!.height;
  const box = (await page.getByTestId('response-splitter').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 40, { steps: 5 });
  await page.mouse.up();
  expect((await pane.boundingBox())!.height).toBeGreaterThan(before + 30);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
});

test.describe('binary and PDF responses', () => {
  /** Routes https://mock.test/** (answers CORS too) with a per-path response and records what the browser sent. */
  async function mockServerWith(page: Page, respond: (url: URL) => { status?: number; contentType?: string; body: string | Buffer; headers?: Record<string, string> }) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    await page.route('https://mock.test/**', async (route) => {
      const r = route.request();
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const out = respond(new URL(r.url()));
      return route.fulfill({ status: out.status ?? 200, contentType: out.contentType ?? 'application/json', body: out.body, headers: { ...cors, ...(out.headers || {}) } });
    });
  }
  const send = async (page: Page) => { await page.getByTestId('request-send-btn').click(); };
  const status = (page: Page) => page.getByTestId('response-status');

  test('[I1.4] a PDF is rendered/downloadable and a binary zip does not crash the viewer', async ({ page }) => {
    await mockServerWith(page, (u) => u.pathname === '/pdf'
      ? { contentType: 'application/pdf', body: Buffer.from('JVBERi0xLg==', 'base64') }
      : { contentType: 'application/zip', body: Buffer.from([0x50, 0x4b, 3, 4, 0, 255, 254, 0, 1, 2]) });
    await scene(page, { url: 'https://mock.test/pdf' });
    await send(page);
    await expect(page.locator('object[type="application/pdf"]')).toBeVisible();
    await page.getByTestId('request-url-input').fill('https://mock.test/zip');
    await send(page);
    await expect(status(page)).toContainText('200');
    const dl = page.waitForEvent('download');
    await page.getByTitle('Save Response').click();
    await dl;
  });
});

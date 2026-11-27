import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';
import http from 'http';
import { type AddressInfo } from 'net';
import { registerUser } from '../helpers';

test.describe('URL, headers and body of a sent request', () => {
  interface Seen { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }
  let server: http.Server;
  let PORT = 0;
  let seen: Seen[] = [];
  const base = () => `http://localhost:${PORT}`;
  const hitsOn = (prefix: string) => seen.filter((s) => s.url.startsWith(prefix));

  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const cors: Record<string, string> = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Allow-Headers': String(req.headers['access-control-request-headers'] || '*'),
        };
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
        const rec: Seen = { method: req.method || '', url: req.url || '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
        seen.push(rec);
        const m = /^\/status\/(\d+)/.exec(rec.url);
        res.writeHead(m ? Number(m[1]) : 200, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rec));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    PORT = (server.address() as AddressInfo).port;
  });
  test.afterAll(async () => { await new Promise((r) => server.close(r)); });
  test.beforeEach(() => { seen = []; });

  /** Fresh account, landed on a new empty request tab. */
  async function newRequestPage(page: Page, prefix = 'dfail') {
    const email = await registerUser(page, prefix);
    // Sending jar cookies is off by default; the cookie tests below need it on.
    await page.request.put('/api/auth/settings', { data: { sendCookies: true } });
    await page.reload();
    await page.getByTestId('create-request-btn').click();
    await expect(page.getByTestId('request-url-input')).toBeVisible();
    return email;
  }

  async function send(page: Page) {
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 15000 });
  }

  async function setUrl(page: Page, url: string) {
    await page.getByTestId('request-url-input').fill(url);
  }

  async function addHeader(page: Page, idx: number, key: string, value: string) {
    await page.getByTestId('req-tab-headers').click();
    await page.getByTestId(`kv-key-${idx}`).fill(key);
    await page.getByTestId(`kv-val-${idx}`).fill(value);
  }

  async function openConsole(page: Page) {
    if (!(await page.getByTestId('console-drawer').isVisible().catch(() => false))) {
      await page.getByTestId('console-toggle-btn').click();
    }
    await expect(page.getByTestId('console-drawer')).toBeVisible();
  }

  /** Text of the newest request log's expanded details in the Console (secrets revealed). */
  async function consoleRequestDetails(page: Page): Promise<string> {
    await openConsole(page);
    const reveal = page.getByTestId('console-reveal-btn');
    await page.getByTestId('console-log-request').first().click();
    let text = await page.getByTestId('console-log-details').first().innerText();
    if (text.includes('••••') && (await reveal.isVisible().catch(() => false))) {
      await reveal.click();
      text = await page.getByTestId('console-log-details').first().innerText();
    }
    return text;
  }

  async function personalWorkspaceId(page: Page): Promise<string> {
    const wss = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wss) ? wss : wss.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    return ws.id ?? ws._id;
  }

  /** After a reload: make sure an empty request tab is open. */
  async function ensureRequestTab(page: Page) {
    const url = page.getByTestId('request-url-input');
    await page.waitForTimeout(1500);
    if (!(await url.isVisible().catch(() => false))) {
      const cr = page.getByTestId('create-request-btn');
      if (await cr.isVisible().catch(() => false)) await cr.click();
      else await page.getByTestId('new-tab-btn').click();
    }
    await expect(url).toBeVisible();
  }

  test('[D1.3] a #fragment is not leaked into the last query-param value', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `${base()}/echo?flag&empty=&eq=x=y#section`);
    await expect(page.getByTestId('kv-key-2')).toHaveValue('eq');
    await expect(page.getByTestId('kv-val-2')).toHaveValue('x=y');
  });

  test('[D1.5] URL without scheme gets http://; javascript: gets a clear "unsupported protocol" error', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `localhost:${PORT}/noscheme`);
    await send(page);
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(hitsOn('/noscheme').length).toBe(1);

    await setUrl(page, 'javascript:alert(1)');
    await send(page);
    const body = page.getByTestId('response-body-viewer');
    await expect(body).toContainText(/unsupported.protocol/i, { timeout: 20000 });
    await expect(body).not.toContainText('http://javascript');
  });

  test('[D1.6] an empty URL shows a client-side validation message, not a "500 Error" status', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, '');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toBeVisible();
    await expect(page.getByTestId('response-body-viewer')).toContainText('Enter a request URL');
    await expect(page.getByTestId('response-status')).not.toContainText('500');
  });

  test('[D1.10] user:pass@host in the URL is sent as a Basic Authorization header', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `http://admin:secret@localhost:${PORT}/basicauth`);
    await send(page);
    await expect(page.getByTestId('response-status')).toContainText('200');
    const hit = hitsOn('/basicauth')[0];
    expect(hit?.headers.authorization).toBe(`Basic ${Buffer.from('admin:secret').toString('base64')}`);
  });

  test('[D2.3] duplicate header names are all sent (folded per RFC 7230), not only the last', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `${base()}/dup`);
    await addHeader(page, 0, 'X-Dup', 'value1');
    await addHeader(page, 1, 'x-dup', 'value2');
    await send(page);
    const v = String(hitsOn('/dup')[0]?.headers['x-dup']);
    expect(v).toContain('value1');
    expect(v).toContain('value2');
  });

  test('[D2.5] a forbidden browser header (Host) triggers a visible warning instead of being dropped silently', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `${base()}/forbidden`);
    await addHeader(page, 0, 'Host', 'custom-host.example.com');
    await send(page);
    await openConsole(page);
    await expect(page.getByTestId('console-log-warn').filter({ hasText: /Host/ }).first()).toBeVisible();
  });

  test('[D2.6] a header value with Hebrew/Unicode does not crash the send', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `${base()}/unicode`);
    await addHeader(page, 0, 'X-Lang', 'עברית');
    await send(page);
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(hitsOn('/unicode')[0]?.headers['x-lang']).toBeTruthy();
  });

  test('[D2.8] the Console shows the auto Content-Length of a sent body', async ({ page }) => {
    await newRequestPage(page);
    await page.getByTestId('method-select').selectOption('POST');
    await setUrl(page, `${base()}/clen`);
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-raw').click();
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 60000 });
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type('{"a":1}');
    await send(page);
    const details = await consoleRequestDetails(page);
    expect(details.toLowerCase()).toContain('content-length');
  });

  test('[D3.1] JSON comments in a raw body are stripped before sending (default language)', async ({ page }) => {
    await newRequestPage(page);
    await page.getByTestId('method-select').selectOption('POST');
    await setUrl(page, `${base()}/jsoncomments`);
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-raw').click();
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 60000 });
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type('{');
    await page.keyboard.press('Enter');
    await page.keyboard.type('// note');
    await page.keyboard.press('Enter');
    await page.keyboard.type('"name":"test"');
    await send(page);
    const body = hitsOn('/jsoncomments')[0]?.body ?? '';
    expect(body).not.toContain('note');
    expect(JSON.parse(body)).toEqual({ name: 'test' });
  });

  test('[D3.4] form-data file field: after save + reload it shows "not saved, re-select" and a send without the file does not crash', async ({ page }) => {
    await newRequestPage(page);
    const id = await personalWorkspaceId(page);
    const col = await page.request.post(`/api/workspaces/${id}/collections`, { data: { name: 'FormCol' } });
    expect(col.ok()).toBeTruthy();
    await page.reload();
    await ensureRequestTab(page);
    await page.getByTestId('method-select').selectOption('POST');
    await setUrl(page, `${base()}/formfile`);
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-form-data').click();
    await page.getByTestId('kv-key-0').fill('doc');
    await page.getByTestId('kv-key-0').locator('xpath=..').locator('select').selectOption('file');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('FormFileReq');
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('save-req-name-input')).toBeHidden();
    await page.reload();
    await page.getByTestId('node-FormCol').click();
    await page.getByTestId('node-FormFileReq').click();
    await page.getByTestId('req-tab-body').click();
    await expect(page.getByTestId('kv-file-missing-0')).toBeVisible();
    await send(page);
    await expect(page.getByTestId('response-status')).toContainText('200');
  });

});

import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { apiAs, apiAsAdmin, registerUser, treeNode, openNodeMenu, selectWorkspace } from '../helpers';
import http, { createServer, type Server, type IncomingMessage } from 'http';
import { type AddressInfo } from 'net';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

test.describe('moved from legacy-manual (api)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  /**
   * One Playwright test per HTTP/API-level failure listed in MANUAL_TEST_PLAN_FAILED.md.
   * Each test asserts the CORRECT behaviour and carries the plan id in its title
   * ("[A1.6] …") so it can be grepped:  npx playwright test -g "\[A1.6\]".
   * A test whose bug is still present is marked `test.fail()` — it flips red as soon
   * as the bug is fixed, which is the signal to delete that line.
   */

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }

  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    const body = await res.json();
    return { ctx, email, id: (body.user?.id ?? body.user?._id) as string };
  }

  async function newWorkspace(ctx: APIRequestContext, name = uniq('ws')) {
    const res = await ctx.post('/api/workspaces', { data: { name } });
    expect(res.ok(), 'create workspace').toBeTruthy();
    const ws = await res.json();
    return (ws.id ?? ws._id) as string;
  }

  test.describe('C — tree (API)', () => {
    test('[D6.3] saving a request that someone else deleted answers a clean 404', async () => {
      const { ctx } = await newUser('d63');
      const wsId = await newWorkspace(ctx);
      const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const colId = col.id ?? col._id;
      const r = await (await ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'R', method: 'GET', url: 'http://x' } })).json();
      const rid = r.id ?? r._id;
      await ctx.delete(`/api/requests/${rid}`);
      expect((await ctx.put(`/api/requests/${rid}`, { data: { name: 'again' } })).status()).toBe(404);
    });
  });

});

test.describe('moved from legacy-manual (d)', () => {
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

  async function createEnv(page: Page, name: string, vars: Record<string, string>) {
    const wsId = await personalWorkspaceId(page);
    const res = await page.request.post(`/api/workspaces/${wsId}/environments`, {
      data: { name, variables: Object.entries(vars).map(([key, v]) => ({ key, initialValue: v, currentValue: v, enabled: true, type: 'default' })) },
    });
    expect(res.ok(), 'create env').toBeTruthy();
    await page.reload();
    await page.getByTestId('env-select').selectOption({ label: name });
    await ensureRequestTab(page);
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

  /** The settings PUT is rejected by the server (see [D-SETTINGS]), which rolls the toggle back; stub it so D-tests exercise their own feature. */
  async function stubSettingsSave(page: Page) {
    await page.route('**/api/auth/settings', (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) : route.continue());
  }

  async function openSettings(page: Page) {
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('global-settings-close-btn')).toBeVisible();
  }
  async function closeSettings(page: Page) {
    await page.getByTestId('global-settings-close-btn').click();
  }

  test.describe('D - requests and HTTP (UI, failed-manual-test regressions)', () => {
    // cookies
    async function openCookieManager(page: Page) {
      await page.locator('button[aria-label="Manage cookies"]').click();
      await expect(page.getByTestId('cookie-manager-modal')).toBeVisible();
    }
    async function addCookieRow(page: Page, fields: { name: string; value: string; path?: string; expires?: string; secure?: boolean }, rowIdx: number) {
      await page.getByTestId('cookie-add-btn').click();
      const row = page.getByTestId('cookie-row').nth(rowIdx);
      await row.getByTestId('cookie-name-input').fill(fields.name);
      await row.getByTestId('cookie-value-input').fill(fields.value);
      if (fields.path) await row.getByTestId('cookie-path-input').fill(fields.path);
      if (fields.expires) await row.getByTestId('cookie-expires-input').fill(fields.expires);
      if (fields.secure) await row.locator('input[type=checkbox]').nth(1).check();
    }

    // load test
    async function openLoadTest(page: Page) {
      await page.getByTestId('load-test-open-btn').click();
      await expect(page.getByTestId('load-test-modal')).toBeVisible();
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

    test('[D12.2] cookies are only sent to paths that match the cookie Path', async ({ page }) => {
      await newRequestPage(page);
      await openCookieManager(page);
      await addCookieRow(page, { name: 'sid', value: 'abc123', path: '/api' }, 0);
      await page.getByTestId('cookie-close-btn').click();

      await setUrl(page, `${base()}/other/thing`);
      await send(page);
      expect(await consoleRequestDetails(page)).not.toContain('sid=abc123');
      await page.getByTestId('console-clear-btn').click();

      await setUrl(page, `${base()}/api/thing`);
      await send(page);
      expect(await consoleRequestDetails(page)).toContain('sid=abc123');
    });

    test('[D12.3] Secure cookies are not sent over http, and expired cookies are dropped', async ({ page }) => {
      await newRequestPage(page);
      await openCookieManager(page);
      await addCookieRow(page, { name: 'plain', value: 'p1' }, 0);
      await addCookieRow(page, { name: 'sec', value: 's1', secure: true }, 1);
      await addCookieRow(page, { name: 'old', value: 'o1', expires: '2000-01-01T00:00:00Z' }, 2);
      await page.getByTestId('cookie-close-btn').click();

      await setUrl(page, `${base()}/cookies`);
      await send(page);
      const details = await consoleRequestDetails(page);
      expect(details).toContain('plain=p1');
      expect(details).not.toContain('sec=s1');
      expect(details).not.toContain('old=o1');
    });

    test('[D12.4] cookies can be added, edited, deleted individually and all at once', async ({ page }) => {
      await newRequestPage(page);
      await openCookieManager(page);
      await addCookieRow(page, { name: 'first', value: 'v1' }, 0);
      await expect(page.getByTestId('cookie-name-input').first()).toHaveValue('first');
      await expect(page.getByTestId('cookie-value-input').first()).toHaveValue('v1');
      await addCookieRow(page, { name: 'second', value: 'v2' }, 1);
      await expect(page.getByTestId('cookie-row')).toHaveCount(2);
      await page.getByTestId('cookie-delete-btn').first().click();
      await expect(page.getByTestId('cookie-row')).toHaveCount(1);
      await expect(page.getByTestId('cookie-name-input').first()).toHaveValue('second');
      await addCookieRow(page, { name: 'third', value: 'v3' }, 1);
      await page.getByTestId('cookie-delete-all-btn').click();
      await expect(page.getByTestId('cookie-row')).toHaveCount(0);
    });

    test('[D12.7] a setting turns off automatic sending of jar cookies', async ({ page }) => {
      await newRequestPage(page);
      await openCookieManager(page);
      await addCookieRow(page, { name: 'sid', value: 'abc123' }, 0);
      await page.getByTestId('cookie-close-btn').click();
      await stubSettingsSave(page);
      await openSettings(page);
      await page.locator('#sendCookies').uncheck();
      await closeSettings(page);
      await setUrl(page, `${base()}/nocookies`);
      await send(page);
      expect(await consoleRequestDetails(page)).not.toContain('sid=abc123');
    });
  });

});

test.describe('moved from legacy-manual (efgi)', () => {
  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

  type Seen = { url: string; method: string; headers: Record<string, string>; body: string | null };

  /** Routes https://mock.test/** (answers CORS too) and records what the browser actually sent. */
  async function mockServer(page: Page, respond?: (url: URL) => { status?: number; contentType?: string; body: string | Buffer; headers?: Record<string, string> }) {
    const seen: Seen[] = [];
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    await page.route('https://mock.test/**', async (route) => {
      const r = route.request();
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      seen.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() });
      const out = respond ? respond(new URL(r.url())) : { body: '{"ok":true}' };
      return route.fulfill({ status: out.status ?? 200, contentType: out.contentType ?? 'application/json', body: out.body, headers: { ...cors, ...(out.headers || {}) } });
    });
    return seen;
  }

  async function scene(page: Page, opts: { request: Record<string, unknown>; env?: Array<Record<string, unknown>>; reqName?: string }) {
    // The dev server only accepts the Origin of the default client port (5173); this run uses another port.
    await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed mid-request */ } });
    await registerUser(page, 'efgi');
    const wsList = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    const wsId = ws.id ?? ws._id;
    const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
    const colId = col.id ?? col._id;
    const reqName = opts.reqName ?? 'Req';
    const r = await page.request.post(`/api/collections/${colId}/requests`, { data: { name: reqName, method: 'GET', url: 'https://mock.test/x', ...opts.request } });
    expect(r.ok(), 'create request ' + (await r.text())).toBeTruthy();
    if (opts.env) {
      const e = await page.request.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'EnvA', variables: opts.env } });
      expect(e.ok()).toBeTruthy();
    }
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('node-Col').click();
    await page.getByTestId(`node-${reqName}`).click();
    if (opts.env) await page.getByTestId('env-select').selectOption({ label: 'EnvA' });
    return { wsId, colId };
  }

  const v = (key: string, val: string, extra: Record<string, unknown> = {}) => ({ key, value: val, initialValue: val, currentValue: val, enabled: true, ...extra });
  const send = async (page: Page) => { await page.getByTestId('request-send-btn').click(); };
  const status = (page: Page) => page.getByTestId('response-status');

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }
  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } });
    expect(res.status()).toBe(201);
    return { ctx, email };
  }

  test.describe('I — response viewer', () => {
    test('[I1.4] a PDF is rendered/downloadable and a binary zip does not crash the viewer', async ({ page }) => {
      await mockServer(page, (u) => u.pathname === '/pdf'
        ? { contentType: 'application/pdf', body: Buffer.from('JVBERi0xLg==', 'base64') }
        : { contentType: 'application/zip', body: Buffer.from([0x50, 0x4b, 3, 4, 0, 255, 254, 0, 1, 2]) });
      await scene(page, { request: { url: 'https://mock.test/pdf' } });
      await send(page);
      await expect(page.locator('object[type="application/pdf"]')).toBeVisible();
      await page.getByTestId('request-url-input').fill('https://mock.test/zip');
      await send(page);
      await expect(status(page)).toContainText('200');
      const dl = page.waitForEvent('download');
      await page.getByTitle('Save Response').click();
      await dl;
    });

    test('[I3.4] Authorization is masked in the console drawer until "Show secrets" is pressed', async ({ page }) => {
      await mockServer(page);
      await scene(page, { request: { auth: { type: 'bearer', bearer: { token: 'SUPERSECRETTOKEN' } } } });
      await page.getByTestId('console-toggle-btn').click();
      await send(page);
      await expect(status(page)).toContainText('200');
      await page.getByTestId('console-log-request').first().click();
      const details = page.getByTestId('console-log-details');
      await expect(details).toBeVisible();
      await expect(details).not.toContainText('SUPERSECRETTOKEN');
      await page.getByTestId('console-reveal-btn').click();
      await expect(details).toContainText('SUPERSECRETTOKEN');
    });

    test('[I3.5] the console keeps at most 1000 entries', async ({ page }) => {
      await mockServer(page);
      await scene(page, { request: { preRequestScript: 'for (let i=0;i<1100;i++) console.log("line"+i);' } });
      await page.getByTestId('console-toggle-btn').click();
      await send(page);
      await expect(status(page)).toContainText('200');
      await expect(page.getByTestId('console-drawer')).toContainText('Console (1000)');
    });

    test('[I4.2] connection refused (closed port) gives an explanatory message', async ({ page }) => {
      await scene(page, { request: { url: 'http://127.0.0.1:1/x' } });
      await send(page);
      await expect(status(page)).toContainText('Network Error');
      await expect(page.getByTestId('response-body-viewer')).toContainText('Could not reach http://127.0.0.1:1/x');
    });

    test('[I4.3] an unreachable response explains the problem and suggests the extension', async ({ page }) => {
      // Port 1 has no listener, so the browser's cross-origin fetch fails before any response arrives.
      await scene(page, { request: { url: 'http://127.0.0.1:1/x' } });
      await send(page);
      await expect(status(page)).toContainText('Network Error');
      await expect(page.getByTestId('response-body-viewer')).toContainText(/extension/i);
    });

    test('[I4.6] Cancel aborts the request and reports "Canceled" (distinct from a timeout)', async ({ page }) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => { release = r; });
      await page.route('https://slow.test/**', async (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        await gate;
        await route.fulfill({ status: 200, body: 'late', headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
      });
      await scene(page, { request: { url: 'https://slow.test/x' } });
      await send(page);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(status(page)).toContainText('Canceled');
      await expect(page.getByTestId('response-body-viewer')).not.toContainText(/timed out/i);
      release();
    });
  });

});

test.describe('moved from legacy-manual (nop)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  /**
   * Playwright tests for the failures of groups N1.12, O1-O4, P1-P6 listed in
   * MANUAL_TEST_PLAN_FAILED.md. Each test asserts the CORRECT behaviour and carries
   * the plan id in its title. `test.fail()` marks a bug that is still present.
   * Connection tests talk to REAL servers started inside the test (ws, socket.io, http SSE).
   */

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WebSocketServer } = require('ws');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Server: IoServer } = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'socket.io'));

  const listen = (srv: Server) => new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as any).port)));

  async function openConnectionTab(page: Page, protocol: 'WS' | 'SOCKETIO' | 'SSE' | 'KAFKA') {
    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-protocol-select').selectOption(protocol);
  }

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;

  const CERT_PEM = "-----BEGIN CERTIFICATE-----\r\nMIIBhzCCAS2gAwIBAgIUSC01PKBBLEzZ4okJFaSgUTfq454wCgYIKoZIzj0EAwIw\r\nGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDAgFw0yNjEwMTYwOTM4NTBaGA8yMTI2\r\nMDkyMjA5Mzg1MFowGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDBZMBMGByqGSM49\r\nAgEGCCqGSM49AwEHA0IABKTR0pLsVVpt/H4g2XcyGnYR4CKehPYxaTxALWy32T15\r\nQN2AGDqLgMknFCgGu1Z6Hvp5YQtlz6ZUYow90cP910CjUzBRMB0GA1UdDgQWBBRa\r\nFZjWtRBOs5BKsYxKZZZQhFcYsTAfBgNVHSMEGDAWgBRaFZjWtRBOs5BKsYxKZZZQ\r\nhFcYsTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQC8VVrIpLt0\r\nG1bGJQSqK8SoqGJqrjYyLhhqX+8/drKmqQIgETNqoXOhtRdIH8ec/vv9o4hIC5bg\r\nzPI4mEPRkPc4dw8=\r\n-----END CERTIFICATE-----";
  const KEY_PEM = "-----BEGIN PRIVATE KEY-----\r\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnrQB7AqhdPqXamWJ\r\nv+LJM+oqmHIRWaB7Iylu9LrMLkChRANCAASk0dKS7FVabfx+INl3Mhp2EeAinoT2\r\nMWk8QC1st9k9eUDdgBg6i4DJJxQoBrtWeh76eWELZc+mVGKMPdHD/ddA\r\n-----END PRIVATE KEY-----";

  async function newUserCtx(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.${180 + (seq % 40)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` } });
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } });
    expect(res.status()).toBe(201);
    return { ctx, email };
  }

  // ───────────────────────────── N1.12 ─────────────────────────────

  // ───────────────────────────── O — connections ─────────────────────────────

  // ───────────────────────────── P — settings ─────────────────────────────

  test.describe('P — search, settings, certs, theme', () => {
    test('[P2.5] the request editor has per-request settings that override the global ones', async ({ page }) => {
      await registerUser(page, 'p25');
      const wsId0 = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
      expect((await page.request.post(`/api/workspaces/${wsId0}/collections`, { data: { name: 'P25Col' } })).ok()).toBeTruthy();
      await page.reload();
      const name = uniq('p25');
      await page.getByTestId('create-request-btn').click(); // a collection exists: name prompt, saved request (QA-11)
      await page.getByTestId('prompt-input').fill(name);
      await page.getByTestId('prompt-submit').click();
      await expect(page.getByTestId('req-tab-settings')).toBeVisible({ timeout: 3000 });
      await page.getByTestId('req-tab-settings').click();
      await page.getByTestId('req-setting-followRedirects').selectOption('false');
      await page.getByTestId('req-setting-timeout').fill('1234');
      // Saved on the request: persists across a reload of the stored request.
      await page.getByTestId('request-save-btn').click();
      await expect(treeNode(page, name)).toBeVisible();
      const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
      const cols = await (await page.request.get(`/api/workspaces/${wsId}/collections`)).json();
      const colId = (cols[0] ?? cols.collections?.[0])._id;
      const list = await (await page.request.get(`/api/collections/${colId}/requests`)).json();
      const saved = (Array.isArray(list) ? list : list.requests).find((r: any) => r.name === name);
      const full = await (await page.request.get(`/api/requests/${saved._id}`)).json();
      expect(full.settings).toMatchObject({ followRedirects: false, timeout: 1234 });
    });
  });

});

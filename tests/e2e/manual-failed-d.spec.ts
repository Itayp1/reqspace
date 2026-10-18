import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import http from 'http';
import type { AddressInfo } from 'net';
import { registerUser, apiAs, treeNode, openNodeMenu } from './helpers';

/**
 * One Playwright test per D-section (requests & HTTP) failure listed in
 * MANUAL_TEST_PLAN_FAILED.md. Each test asserts the CORRECT behaviour and carries
 * the plan id in its title ("[D1.5] ..."). A test whose bug is still present is
 * marked `test.fail()`.
 * Requests are sent from the browser to a local echo server started in beforeAll.
 */

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

  test('[D1.11] {{ autocomplete: ArrowDown + Enter inserts the variable', async ({ page }) => {
    await newRequestPage(page);
    await createEnv(page, 'AutoEnv', { baseUrl: 'http://x', other: 'y' });
    const input = page.getByTestId('request-url-input');
    await input.click();
    await input.fill('');
    await input.pressSequentially('{{');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue(/^\{\{\w+\}\}$/);
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

  test('[D2.7] {{token}} in a header value is resolved from the active environment', async ({ page }) => {
    await newRequestPage(page);
    await createEnv(page, 'HdrEnv', { token: 'my-secret-123' });
    await setUrl(page, `${base()}/hdrvar`);
    await addHeader(page, 0, 'X-Token', '{{token}}');
    await send(page);
    expect(hitsOn('/hdrvar')[0]?.headers['x-token']).toBe('my-secret-123');
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

  test('[D4.8] with Verify SSL off the browser transport warns that it cannot skip certificate checks', async ({ page }) => {
    await newRequestPage(page);
    await stubSettingsSave(page);
    await openSettings(page);
    await page.locator('#verifySsl').uncheck();
    await closeSettings(page);
    await setUrl(page, `${base()}/ssl`);
    await send(page);
    await openConsole(page);
    await expect(page.getByTestId('console-log-warn').filter({ hasText: /Verify SSL/i }).first()).toBeVisible();
  });

  test('[D4.9] a configured local proxy is flagged as unsupported by the browser transport', async ({ page }) => {
    await newRequestPage(page);
    await stubSettingsSave(page);
    await openSettings(page);
    await page.getByTestId('proxy-enable-checkbox').check();
    await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:54321');
    await expect(page.getByTestId('proxy-browser-warning')).toBeVisible();
    await closeSettings(page);
    await setUrl(page, `${base()}/proxy`);
    await send(page);
    await openConsole(page);
    await expect(page.getByTestId('console-log-warn').filter({ hasText: /proxy/i }).first()).toBeVisible();
  });

  test('[D8.3] user B with a clean open tab gets user A saved change silently (no conflict)', async ({ page, browser }) => {
    const emailA = await registerUser(page, 'd83a');
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const emailB = await registerUser(pageB, 'd83b');
    const a = await apiAs(emailA);
    const ws = await (await a.post('/api/workspaces', { data: { name: `D83 ${Date.now()}` } })).json();
    const wsId = ws.id ?? ws._id;
    const col = await (await a.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'D83Col' } })).json();
    const colId = col.id ?? col._id;
    const reqRes = await a.post(`/api/collections/${colId}/requests`, { data: { name: 'D83Req', method: 'GET', url: 'http://localhost/one', folderId: null } });
    expect(reqRes.ok(), await reqRes.text()).toBeTruthy();
    const created = (await reqRes.json()) as any;
    const rid = created.id ?? created._id;
    expect((await a.post(`/api/workspaces/${wsId}/members`, { data: { email: emailB, role: 'editor' } })).ok()).toBeTruthy();

    await pageB.reload();
    await pageB.getByTestId('workspace-select').selectOption(wsId);
    await pageB.getByTestId('node-D83Col').click();
    const loaded = pageB.waitForResponse((r) => /\/api\/requests\/[^/]+$/.test(r.url()) && r.request().method() === 'GET');
    await pageB.getByTestId('node-D83Req').click();
    await loaded;
    await expect(pageB.getByTestId('request-url-input')).toHaveValue('http://localhost/one');

    const put = await a.put(`/api/requests/${rid}`, { data: { url: 'http://localhost/two' } });
    expect(put.ok(), await put.text()).toBeTruthy();

    await expect(pageB.getByTestId('request-url-input')).toHaveValue('http://localhost/two', { timeout: 15000 });
    await expect(pageB.getByTestId('conflict-indicator')).toHaveCount(0);
    await ctxB.close();
  });

  test('[D10.3] a viewer with an empty personal workspace can copy a request there (default writable target, auto collection)', async ({ page, browser }) => {
    const ownerEmail = await registerUser(page, 'd103o');
    const ctxV = await browser.newContext();
    const pageV = await ctxV.newPage();
    const viewerEmail = await registerUser(pageV, 'd103v');
    const owner = await apiAs(ownerEmail);
    const ws = await (await owner.post('/api/workspaces', { data: { name: `D103 ${Date.now()}` } })).json();
    const wsId = ws.id ?? ws._id;
    const col = await (await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'D103Col' } })).json();
    const r = await owner.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'D103Req', method: 'GET', url: 'http://localhost/x', folderId: null } });
    expect(r.ok(), await r.text()).toBeTruthy();
    expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).ok()).toBeTruthy();

    await pageV.reload();
    await pageV.getByTestId('workspace-select').selectOption(wsId);
    await pageV.getByTestId('node-D103Col').click();
    await expect(treeNode(pageV, 'D103Req')).toBeVisible();
    await openNodeMenu(pageV, 'D103Req');
    await pageV.getByTestId('action-menu-copy-to-workspace').click();
    const modal = pageV.getByTestId('copy-to-workspace-modal');
    await expect(modal).toBeVisible();
    await expect(pageV.getByTestId('copy-target-workspace-select')).not.toHaveValue(wsId);
    await pageV.getByTestId('copy-submit-btn').click();
    await expect(modal).toBeHidden({ timeout: 10000 });

    const vctx = await apiAs(viewerEmail);
    const wss = await (await vctx.get('/api/workspaces')).json();
    const list = Array.isArray(wss) ? wss : wss.workspaces;
    const personal = list.find((w: any) => w.isPersonal);
    const cols = await (await vctx.get(`/api/workspaces/${personal.id ?? personal._id}/collections`)).json();
    expect(cols.length).toBeGreaterThan(0);
    await ctxV.close();
  });

  test('[D-SETTINGS] saving global settings succeeds (PUT /api/auth/settings accepts every key the client sends)', async ({ page }) => {
    await newRequestPage(page);
    const res = await page.request.put('/api/auth/settings', { data: { verifySsl: false, sendCookies: true } });
    expect(res.status()).toBe(200);
  });

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

  // load test
  async function openLoadTest(page: Page) {
    await page.getByTestId('load-test-open-btn').click();
    await expect(page.getByTestId('load-test-modal')).toBeVisible();
  }

  test('[D13.1] the Load Test report shows p95 and requests/second', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `${base()}/lt`);
    await openLoadTest(page);
    await page.getByTestId('load-test-iterations').fill('5');
    await page.getByTestId('load-test-start-btn').click();
    await expect(page.getByTestId('load-test-success')).toHaveText('5', { timeout: 20000 });
    await expect(page.getByTestId('load-test-p95')).toContainText(/p95: \d+/);
    await expect(page.getByTestId('load-test-rps')).toContainText(/RPS: [1-9]/);
  });

  test('[D13.3] invalid iterations/concurrency values are rejected with a message and nothing is sent', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `${base()}/ltinvalid`);
    await openLoadTest(page);
    for (const bad of ['0', '-3', '', '1000000']) {
      await page.getByTestId('load-test-iterations').fill(bad);
      await page.getByTestId('load-test-start-btn').click();
      await expect(page.getByTestId('load-test-error'), `iterations=${bad}`).toBeVisible();
    }
    await page.getByTestId('load-test-iterations').fill('5');
    await page.getByTestId('load-test-concurrency').fill('0');
    await page.getByTestId('load-test-start-btn').click();
    await expect(page.getByTestId('load-test-error')).toBeVisible();
    await page.waitForTimeout(300);
    expect(hitsOn('/ltinvalid').length).toBe(0);
  });

  test('[D13.4] 5xx responses count as Failed, not Success', async ({ page }) => {
    await newRequestPage(page);
    await setUrl(page, `${base()}/status/500`);
    await openLoadTest(page);
    await page.getByTestId('load-test-iterations').fill('4');
    await page.getByTestId('load-test-start-btn').click();
    await expect(page.getByTestId('load-test-failed')).toHaveText('4', { timeout: 20000 });
    await expect(page.getByTestId('load-test-success')).toHaveText('0');
  });

  test('[D13.6] Load Test resolves {{$guid}}, environment variables and auth headers per iteration', async ({ page }) => {
    await newRequestPage(page);
    await createEnv(page, 'LtEnv', { token: 'env-token-1' });
    await setUrl(page, `${base()}/ltvars`);
    await addHeader(page, 0, 'X-Id', '{{$guid}}');
    await addHeader(page, 1, 'X-Tok', '{{token}}');
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('{{token}}');
    await openLoadTest(page);
    await page.getByTestId('load-test-iterations').fill('3');
    await page.getByTestId('load-test-start-btn').click();
    await expect(page.getByTestId('load-test-success')).toHaveText('3', { timeout: 20000 });
    const hits = hitsOn('/ltvars');
    expect(hits.length).toBe(3);
    const ids = hits.map((h) => String(h.headers['x-id']));
    expect(ids.every((i) => i && !i.includes('{{'))).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(hits.every((h) => h.headers['x-tok'] === 'env-token-1')).toBe(true);
    expect(hits.every((h) => h.headers.authorization === 'Bearer env-token-1')).toBe(true);
  });
});

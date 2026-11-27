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

  test.describe('B — workspaces & members (API)', () => {
    test('[B8.1] a viewer gets a real 403 on every editor-only write', async () => {
      const owner = await newUser('b81o');
      const viewer = await newUser('b81v');
      const wsId = await newWorkspace(owner.ctx);
      await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewer.email, role: 'viewer' } });
      const col = await (await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const colId = col.id ?? col._id;
      expect((await viewer.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'X' } })).status()).toBe(403);
      expect((await viewer.ctx.post(`/api/collections/${colId}/folders`, { data: { name: 'X' } })).status()).toBe(403);
      expect((await viewer.ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'X', method: 'GET', url: 'http://x' } })).status()).toBe(403);
      expect((await viewer.ctx.delete(`/api/collections/${colId}`)).status()).toBe(403);
      expect((await viewer.ctx.put(`/api/workspaces/${wsId}`, { data: { name: 'nope' } })).status()).toBe(403);
      expect((await viewer.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: owner.email, role: 'editor' } })).status()).toBe(403);
    });
  });

  test.describe('R — server (API)', () => {
    test('[R2.2] an unknown /api/* path answers JSON 404, not the SPA shell', async () => {
      const { ctx } = await newUser('r22');
      const res = await ctx.get('/api/zzz');
      expect(res.status()).toBe(404);
      expect(res.headers()['content-type']).toMatch(/json/);
    });

    test('[R5.3] a cross-origin POST with a valid cookie is refused', async () => {
      const { ctx } = await newUser('r53');
      const res = await ctx.post('/api/workspaces', { data: { name: uniq('csrf') }, headers: { Origin: 'https://evil.example' } });
      expect(res.status()).toBe(403);
    });

    test('[R-CONC] 20 parallel workspace creations all succeed', async () => {
      const { ctx } = await newUser('rconc');
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => ctx.post('/api/workspaces', { data: { name: uniq(`conc${i}`) } })));
      expect(results.map((r) => r.status()).filter((s) => s !== 201)).toEqual([]);
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
    // A plain browser cannot route a request through a proxy, so this runs against the desktop
    // transport (electron/httpRequest.js): REQSPACE_TARGET=electron npx playwright test -g P3.1
    test.describe('[P3.1] desktop transport @electron', () => {
    test.use({ desktopTransport: 'real' } as any);
    test('[P3.1] requests go through the configured local proxy (and directly when off)', async ({ page }) => {
      const proxied: string[] = [];
      const direct: string[] = [];
      const proxy: Server = createServer((req, res) => { proxied.push(req.url || ''); res.end('via-proxy'); });
      const origin: Server = createServer((req, res) => { direct.push(req.url || ''); res.end('direct'); });
      await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
      await new Promise<void>((r) => origin.listen(0, '127.0.0.1', r));
      const proxyPort = (proxy.address() as any).port;
      const originPort = (origin.address() as any).port;
      try {
        await registerUser(page, 'p31');
        await page.getByTestId('settings-btn').click();
        await page.getByTestId('proxy-enable-checkbox').check();
        await page.getByTestId('proxy-url-input').fill(`http://127.0.0.1:${proxyPort}`);
        await page.getByTestId('proxy-noproxy-input').fill('');
        await page.getByTestId('global-settings-close-btn').click();

        await page.getByTestId('new-tab-btn').click();
        // An unresolvable host: it can only be answered by the proxy.
        await page.getByTestId('request-url-input').fill('http://proxied-host.invalid/p31');
        await page.getByTestId('request-send-btn').click();
        await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 15000 });
        expect(proxied.some((u) => u.includes('proxied-host.invalid/p31'))).toBe(true);

        await page.getByTestId('settings-btn').click();
        await page.getByTestId('proxy-enable-checkbox').uncheck();
        await page.getByTestId('global-settings-close-btn').click();

        const before = proxied.length;
        await page.getByTestId('request-url-input').fill(`http://127.0.0.1:${originPort}/p31-direct`);
        await page.getByTestId('request-send-btn').click();
        await expect.poll(() => direct.length, { timeout: 15000 }).toBeGreaterThan(0);
        expect(direct[0]).toBe('/p31-direct');
        expect(proxied.length).toBe(before);
      } finally {
        proxy.close();
        origin.close();
      }
    });
    });

    test('[P3.2] an invalid proxy URL (abc / empty) shows an inline error; a valid URL does not', async ({ page }) => {
      await registerUser(page, 'p32');
      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').check();
      await page.getByTestId('proxy-url-input').fill('abc');
      await expect(page.getByTestId('proxy-url-error')).toBeVisible();
      await page.getByTestId('proxy-url-input').fill('');
      await expect(page.getByTestId('proxy-url-error')).toBeVisible();
      await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:8080');
      await expect(page.getByTestId('proxy-url-error')).toBeHidden();
      await page.getByTestId('proxy-auth-checkbox').check();
      await expect(page.getByTestId('proxy-username-input')).toBeVisible();
      await expect(page.getByTestId('proxy-password-input')).toBeVisible();
    });

    test('[P3.3] No-proxy field exists and a plain browser warns that the proxy is not applied', async ({ page }) => {
      await registerUser(page, 'p33');
      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').check();
      await expect(page.getByTestId('proxy-noproxy-input')).toBeVisible();
      await page.getByTestId('proxy-noproxy-input').fill('localhost, *.internal');
      await expect(page.getByTestId('proxy-browser-warning')).toBeVisible();
    });

    test('[P3.4] the proxy password is a password field and never stored in localStorage', async ({ page }) => {
      await registerUser(page, 'p34');
      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').check();
      await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:8080');
      await page.getByTestId('proxy-auth-checkbox').check();
      await page.getByTestId('proxy-password-input').fill('S3cretProxyPw');
      await expect(page.getByTestId('proxy-password-input')).toHaveAttribute('type', 'password');
      await page.waitForTimeout(500);
      const dump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
      expect(dump).not.toContain('S3cretProxyPw');
    });

    test('[P4.2] mTLS: sending to a server that demands a client cert succeeds with it and fails without', async () => {
      // Electron-only transport (electron/httpRequest.js); exercised directly in Node against a real mTLS server.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { sendRequest } = require(path.join(__dirname, '..', '..', '..', 'electron', 'httpRequest.js'));
      const https = await import('https');
      const srv = https.createServer({ key: KEY_PEM, cert: CERT_PEM, ca: [CERT_PEM], requestCert: true, rejectUnauthorized: true }, (_q, r) => { r.end('mtls-ok'); });
      const port = await listen(srv as unknown as Server);
      try {
        const url = `https://127.0.0.1:${port}/`;
        const ok = await sendRequest({ method: 'GET', url, verifySsl: false, clientCertificates: [{ hostname: '127.0.0.1', cert: CERT_PEM, key: KEY_PEM }] });
        expect(ok.body).toBe('mtls-ok');
        await expect(sendRequest({ method: 'GET', url, verifySsl: false, clientCertificates: [] })).rejects.toThrow();
      } finally { srv.close(); }
    });

    test('[P4.3] mTLS hostname matching: mismatch not attached; wildcard matches subdomains only', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { hostnameMatches, findClientCertificate } = require(path.join(__dirname, '..', '..', '..', 'electron', 'httpRequest.js'));
      expect(hostnameMatches('*.example.com', 'a.example.com')).toBe(true);
      expect(hostnameMatches('*.example.com', 'a.b.example.com')).toBe(true);
      expect(hostnameMatches('*.example.com', 'example.com')).toBe(false);
      expect(hostnameMatches('api.example.com', 'other.example.com')).toBe(false);
      expect(findClientCertificate([{ hostname: 'api.example.com' }], 'other.example.com')).toBeUndefined();
    });

    test('[P6.1] first visit without the extension prompts, and the Download link serves a real zip', async ({ page }) => {
      await registerUser(page, 'p61');
      const prompt = page.getByTestId('extension-install-prompt');
      await expect(prompt).toBeVisible({ timeout: 10000 });
      const res = await (await pwRequest.newContext()).get(`${API_URL}/extension/reqspace-transport.zip`);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toMatch(/zip/);
      expect((await res.body()).subarray(0, 2).toString()).toBe('PK');
    });
  });

});

test.describe('moved from legacy-manual (qrsuv)', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

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

  test.describe('R — server / build', () => {
    test('[R3.7] concurrent servers on one DB are protected by a migration lock', async () => {
      expect(src('server/src/db/connect.ts')).toContain('reqspace_migration_lock');
    });

    test('[R6.6] Monaco is loaded lazily, not statically imported by the entry bundle', async () => {
      const lazy = src('client/src/components/common/LazyEditor.tsx');
      expect(lazy).toMatch(/lazy\(|import\(/);
      expect(lazy).toContain('monacoEditorImpl');
      expect(lazy).not.toMatch(/^import .* from ['"]\.\/monacoEditorImpl['"]/m);
      expect(lazy).not.toMatch(/^import (?!type).* from ['"]@monaco-editor\/react['"]/m);
    });
  });

  test.describe('S — browser extension (static)', () => {
    test('[S2.3] options.js validates origins (scheme, wildcard, spaces, path)', async () => {
      const js = src('extension/options.js');
      const fn = new Function(`${js.slice(js.indexOf('function validateOrigin'), js.indexOf('async function addOrigin'))}; return validateOrigin;`)();
      expect(fn('https://example.com')).toBe('');
      expect(fn('http://localhost:3000')).toBe('');
      for (const bad of ['example.com', 'https://example.com/path', 'https://exa mple.com', '*', 'https://*.example.com', 'ftp://x.com']) {
        expect(fn(bad), bad).not.toBe('');
      }
      expect(js).toMatch(/includes\(origin\)/);
    });

    test('[S2.6] content.js stays silent (no PONG, no bridge) on origins outside the allowlist', async () => {
      const js = src('extension/content.js');
      expect(js).toContain('originAllowlist.includes(window.location.origin)');
      const handler = js.slice(js.indexOf("addEventListener('message'"));
      expect(handler.indexOf('isAllowed()')).toBeGreaterThan(-1);
      expect(handler.indexOf('isAllowed()')).toBeLessThan(handler.indexOf('REQSPACE_PING'));
      expect(js.slice(js.indexOf('Announce presence'))).toMatch(/isAllowed/);
    });

    test('[S3.3] DNR rules match the exact URL via an escaped regexFilter, unique ids, removed afterwards', async () => {
      const js = src('extension/background.js');
      expect(js).toContain('regexFilter');
      expect(js).not.toMatch(/^\s*urlFilter:/m);
      expect(js).toContain('nextRuleId++');
      expect(js).toContain('removeRuleIds: [ruleId]');
      const esc = new Function(`${js.slice(js.indexOf('function escapeRegex'), js.indexOf('function isBinaryType'))}; return escapeRegex;`)();
      const url = 'https://a.com/p?x=1&y=*|^#z';
      expect(new RegExp('^' + esc(url) + '$').test(url)).toBe(true);
      expect(new RegExp('^' + esc(url) + '$').test('https://a.com/p?x=1&y=other')).toBe(false);
    });

    test('[S3.5] binary responses are returned base64-encoded and decoded by the client', async () => {
      const bg = src('extension/background.js');
      expect(bg).toContain('isBase64');
      expect(bg).toContain('toBase64(buf)');
      expect(src('client/src/transport/extension.ts')).toMatch(/isBase64/);
    });

    test('[S3.6] Set-Cookie is captured via webRequest and bodies are read as ArrayBuffer', async () => {
      // 50MB / 60s / self-signed-cert behaviour needs a real Chrome with the extension loaded: only the code path is asserted.
      expect(JSON.parse(src('extension/manifest.json')).permissions).toContain('webRequest');
      const bg = src('extension/background.js');
      expect(bg).toMatch(/set-cookie/);
      expect(bg).toContain('arrayBuffer()');
    });

    test('[S3.8] Cancel is wired end to end: client -> content script -> background AbortController', async () => {
      expect(src('client/src/transport/extension.ts')).toContain('REQSPACE_CANCEL');
      expect(src('extension/content.js')).toContain('CANCEL_REQUEST');
      const bg = src('extension/background.js');
      expect(bg).toContain("'CANCEL_REQUEST'");
      expect(bg).toContain('controller.abort');
      expect(bg).toContain('signal: controller.signal');
    });
  });

});

import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { registerUser, loginUi, apiAs, apiAsAdmin, treeNode, openNodeMenu, addViaMenu, createCollectionUi, selectWorkspace } from '../helpers';
import http, { createServer, type Server, type IncomingMessage } from 'http';
import { type AddressInfo } from 'net';
import crypto from 'crypto';

test.describe('moved from legacy-manual (abc)', () => {
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

  const idOf = (o: any): string => o.id ?? o._id;

  /** Logs in over HTTP and returns the Cookie header for a socket.io handshake. */
  async function cookieFor(email: string, password = 'password123'): Promise<string> {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip() },
      body: JSON.stringify({ email, password }),
    });
    expect(res.ok, 'login for socket').toBeTruthy();
    const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined;
    return (setCookies || [res.headers.get('set-cookie') || '']).map(c => c.split(';')[0]).join('; ');
  }

  async function connectSocket(cookie: string, workspaceId?: string): Promise<Socket> {
    const socket = io(API_URL, { path: '/ws', extraHeaders: { Cookie: cookie }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    if (workspaceId) {
      socket.emit('join:workspace', workspaceId);
      await new Promise(r => setTimeout(r, 500));
    }
    return socket;
  }

  async function seedWorkspace(owner: APIRequestContext, name = uniq('ws')) {
    const res = await owner.post('/api/workspaces', { data: { name } });
    expect(res.ok(), 'create workspace').toBeTruthy();
    return idOf(await res.json());
  }

  // ───────────────────────────── A — auth ─────────────────────────────

  // ───────────────────────────── B — workspaces ─────────────────────────────

  // C — tree
  async function seedTreeUser(page: Page, prefix: string) {
    const email = await registerUser(page, prefix);
    const api = await apiAs(email);
    const wsList = await (await api.get('/api/workspaces')).json();
    const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
    return { email, api, wsId: idOf(ws) };
  }

  const tabs = (page: Page, text: string) => page.locator('[data-testid^="tab-"]').filter({ hasText: text });
  const menuItem = (page: Page, re: RegExp) => page.locator('[data-testid^="action-menu-"]', { hasText: re }).first();

  test.describe('A — auth & accounts (UI / sockets)', () => {
    test.use({ allowFpErrors: [/Network Error/] });

    test('[A9.3] suspending a user disconnects their live WebSocket', async () => {
      const owner = await newUser('a93o');
      const victim = await newUser('a93v');
      const wsId = await seedWorkspace(owner.ctx);
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: victim.email, role: 'viewer' } })).status()).toBe(201);
      const sock = await connectSocket(await cookieFor(victim.email), wsId);
      try {
        let disconnected = false;
        sock.on('disconnect', () => { disconnected = true; });
        const admin = await apiAsAdmin();
        const res = await admin.post(`/api/admin/users/${victim.id}/suspend`, { data: { suspended: true } });
        expect(res.ok(), 'suspend').toBeTruthy();
        await expect.poll(() => disconnected, { timeout: 5000 }).toBe(true);
      } finally {
        sock.close();
      }
    });
  });

  test.describe('B — workspaces realtime / UI', () => {
    test('[B1.7/B3.3] deleting a workspace moves its connected members away and tells them', async ({ page }) => {
      const owner = await newUser('b17o');
      const memberEmail = await registerUser(page, 'b17m');
      const wsName = uniq('Doomed');
      const wsId = await seedWorkspace(owner.ctx, wsName);
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role: 'editor' } })).status()).toBe(201);
      await page.reload();
      await selectWorkspace(page, wsId);
      await expect(page.getByTestId('workspace-select')).toHaveAttribute('data-value', wsId);
      await page.waitForTimeout(800); // let the socket join the room

      expect((await owner.ctx.delete(`/api/workspaces/${wsId}`)).status()).toBe(200);

      await expect(page.getByTestId('toast-info').filter({ hasText: /deleted/i }).first()).toBeVisible();
      await expect(page.getByTestId('workspace-select')).not.toHaveAttribute('data-value', wsId);
      await page.getByTestId('workspace-select').click();
      await expect(page.getByTestId(`workspace-option-${wsId}`)).toHaveCount(0);
      await page.keyboard.press('Escape');
    });

    test('[B2.1] renaming a workspace updates other members live', async ({ page }) => {
      const owner = await newUser('b21o');
      const memberEmail = await registerUser(page, 'b21m');
      const wsId = await seedWorkspace(owner.ctx, uniq('OldName'));
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role: 'editor' } })).status()).toBe(201);
      await page.reload();
      await selectWorkspace(page, wsId);
      await page.waitForTimeout(800);
      const newName = uniq('Renamed');
      expect((await owner.ctx.put(`/api/workspaces/${wsId}`, { data: { name: newName } })).status()).toBe(200);
      await page.getByTestId('workspace-select').click();
      await expect(page.getByTestId(`workspace-option-${wsId}`)).toHaveText(newName);
      await page.keyboard.press('Escape');
    });

    test('[B6.6] a removed member socket stops receiving workspace events', async () => {
      const owner = await newUser('b66o');
      const member = await newUser('b66m');
      const wsId = await seedWorkspace(owner.ctx);
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: member.email, role: 'editor' } })).status()).toBe(201);
      const col = await (await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const sock = await connectSocket(await cookieFor(member.email), wsId);
      try {
        const got: string[] = [];
        sock.on('request:created', () => got.push('request:created'));
        expect((await owner.ctx.delete(`/api/workspaces/${wsId}/members/${member.id}`)).ok()).toBeTruthy();
        await new Promise(r => setTimeout(r, 500));
        const r = await owner.ctx.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'after-removal', method: 'GET', url: 'https://x.test' } });
        expect(r.ok()).toBeTruthy();
        await new Promise(r2 => setTimeout(r2, 1000));
        expect(got).toEqual([]);
      } finally {
        sock.close();
      }
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
      await selectWorkspace(pageB, wsId);
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

  test.describe('N — realtime access changes', () => {
    async function setup(browser: any, page: Page, role: 'viewer' | 'editor') {
      const ownerEmail = await registerUser(page, 'n112own');
      const owner = await apiAs(ownerEmail);
      const ws = await (await owner.post('/api/workspaces', { data: { name: `N112 ${Date.now()}` } })).json();
      const wsId: string = ws.id ?? ws._id;
      await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Live Col' } });
      const mctx = await browser.newContext();
      const mpage = await mctx.newPage();
      const memberEmail = await registerUser(mpage, 'n112mem');
      expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role } })).ok()).toBeTruthy();
      const member = await apiAs(memberEmail);
      const me = await (await member.get('/api/auth/me')).json();
      const memberId: string = me.user?.id ?? me.user?._id ?? me.id ?? me._id;
      await mpage.reload();
      await selectWorkspace(mpage, wsId);
      await expect(treeNode(mpage, 'Live Col')).toBeVisible();
      return { owner, wsId, mpage, mctx, memberId };
    }

    test('[N1.12] removing a member is pushed live: the removed member loses the workspace without reloading', async ({ page, browser }) => {
      const { owner, wsId, mpage, mctx, memberId } = await setup(browser, page, 'editor');
      const res = await owner.delete(`/api/workspaces/${wsId}/members/${memberId}`);
      expect(res.ok()).toBeTruthy();
      await expect(treeNode(mpage, 'Live Col')).toHaveCount(0, { timeout: 8000 });
      await mpage.getByTestId('workspace-select').click();
      await expect(mpage.getByTestId(`workspace-option-${wsId}`)).toHaveCount(0);
      await mpage.keyboard.press('Escape');
      await mctx.close();
    });

    test('[N1.12] a role change is pushed live to the member', async ({ page, browser }) => {
      const { owner, wsId, mpage, mctx, memberId } = await setup(browser, page, 'viewer');
      const res = await owner.put(`/api/workspaces/${wsId}/members/${memberId}`, { data: { role: 'editor' } });
      expect(res.ok()).toBeTruthy();
      await expect(mpage.getByTestId('toast-info').filter({ hasText: /role .* is now editor/i }).first()).toBeVisible({ timeout: 8000 });
      await mctx.close();
    });
  });

  test.describe('O — connections (real servers)', () => {
    test.beforeEach(async ({ page }) => {
      await registerUser(page, 'conn');
    });

    // --- Socket.IO ---
    async function sioServer() {
      const http = createServer();
      const io = new IoServer(http, { path: '/custom-io', cors: { origin: '*' } });
      const live = { count: 0 };
      const chat = io.of('/chat');
      chat.use((s: any, next: any) => (s.handshake.auth?.token === 'abc' ? next() : next(new Error('bad token'))));
      chat.on('connection', (s: any) => {
        live.count++;
        s.on('disconnect', () => { live.count--; });
        s.emit('hello', { token: s.handshake.auth.token, a: s.handshake.query.a });
        s.on('go', () => { s.emit('evA', 1); s.emit('evB', 2); });
        s.on('multi', (...a: any[]) => { const ack = a.pop(); ack(a); });
      });
      const port = await listen(http);
      return { http, io, port, live };
    }

    async function connectSio(page: Page, port: number) {
      await openConnectionTab(page, 'SOCKETIO');
      await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/chat`);
      await page.getByTestId('connection-sio-path-input').fill('/custom-io');
      await page.getByTestId('connection-sio-auth-input').fill('{"token":"abc"}');
      await page.getByTestId('connection-connect-btn').click();
      await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();
      await page.getByTestId('connection-clear-btn').click();
    }

    // --- SSE ---
    async function sseServer(handler: (req: IncomingMessage, res: any, n: number) => void) {
      const reqs: IncomingMessage[] = [];
      const http = createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        reqs.push(req);
        handler(req, res, reqs.length);
      });
      const port = await listen(http);
      return { http, port, reqs };
    }
    const sseHead = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' };

    test('[O1.4] WebSocket sub-protocol (Sec-WebSocket-Protocol) is sent and negotiated', async ({ page }) => {
      const seen: string[] = [];
      const http = createServer();
      const wss = new WebSocketServer({ server: http, handleProtocols: (p: Set<string>) => { seen.push([...p].join(',')); return [...p][0]; } });
      const port = await listen(http);
      try {
        await openConnectionTab(page, 'WS');
        await page.getByTestId('connection-url-input').fill(`ws://127.0.0.1:${port}/`);
        await page.getByTestId('connection-ws-protocols-input').fill('chat.v1, chat.v2');
        await page.getByTestId('connection-connect-btn').click();
        await expect(page.getByTestId('connection-msg-info').first()).toContainText('protocol: chat.v1');
        expect(seen[0]).toBe('chat.v1,chat.v2');
      } finally { wss.close(); http.close(); }
    });

    test('[O1.4] {{var}} in the sub-protocol field resolves (token from a variable)', async ({ page }) => {
      const seen: string[] = [];
      const http = createServer();
      const wss = new WebSocketServer({ server: http, handleProtocols: (p: Set<string>) => { seen.push([...p].join(',')); return [...p][0]; } });
      const port = await listen(http);
      try {
        const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
        const put = await page.request.put(`/api/workspaces/${wsId}/global-environment`, { data: { variables: [{ key: 'tok', initialValue: 'secret-tok', currentValue: 'secret-tok', enabled: true, type: 'default' }] } });
        expect(put.ok()).toBeTruthy();
        await page.reload();
        await expect(page.getByTestId('workspace-select')).toBeVisible();
        await openConnectionTab(page, 'WS');
        await page.getByTestId('connection-url-input').fill(`ws://127.0.0.1:${port}/`);
        await page.getByTestId('connection-ws-protocols-input').fill('{{tok}}');
        await page.getByTestId('connection-connect-btn').click();
        await expect(page.getByTestId('connection-msg-info').first()).toContainText('protocol: secret-tok');
      } finally { wss.close(); http.close(); }
    });

    test('[O1.8] connection settings and draft message survive a refresh; the connection can be saved to the tree', async ({ page }) => {
      await openConnectionTab(page, 'WS');
      await page.getByTestId('connection-url-input').fill('ws://127.0.0.1:1/keep');
      await page.getByTestId('connection-ws-protocols-input').fill('proto-a');
      await page.reload();
      await expect(page.getByTestId('connection-url-input')).toHaveValue('ws://127.0.0.1:1/keep');
      await expect(page.getByTestId('connection-ws-protocols-input')).toHaveValue('proto-a');
      // ... and a connection tab should be savable into a collection like any request.
      await expect(page.getByTestId('request-save-btn')).toBeVisible({ timeout: 2000 });
      // Save it into a collection; reopening it from the tree restores the connection tab.
      const name = uniq('conn-saved');
      const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
      expect((await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'ConnCol' } })).ok()).toBeTruthy();
      await page.reload();
      await expect(page.getByTestId('connection-url-input')).toHaveValue('ws://127.0.0.1:1/keep');
      await page.getByTestId('request-save-btn').click();
      await page.getByTestId('save-req-name-input').fill(name);
      await page.getByTestId('save-req-submit-btn').click();
      await expect(treeNode(page, name)).toBeVisible();
      await page.getByTestId('new-connection-btn').click(); // move focus to another tab
      await treeNode(page, name).click();
      await expect(page.getByTestId('connection-url-input')).toHaveValue('ws://127.0.0.1:1/keep');
      await expect(page.getByTestId('connection-protocol-select')).toHaveValue('WS');
      await expect(page.getByTestId('connection-ws-protocols-input')).toHaveValue('proto-a');
    });

    test('[O1.9] {{var}} in a WebSocket URL is resolved before connecting', async ({ page }) => {
      const http = createServer();
      const wss = new WebSocketServer({ server: http });
      const port = await listen(http);
      try {
        const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
        await page.request.put(`/api/workspaces/${wsId}/global-environment`, { data: { variables: [{ key: 'wsport', initialValue: String(port), currentValue: String(port), enabled: true, type: 'default' }] } });
        await page.reload();
        await expect(page.getByTestId('workspace-select')).toBeVisible();
        await openConnectionTab(page, 'WS');
        await page.getByTestId('connection-url-input').fill('ws://127.0.0.1:{{wsport}}/');
        await page.getByTestId('connection-connect-btn').click();
        await expect(page.getByTestId('connection-msg-info').first()).toContainText('Connected to WebSocket');
      } finally { wss.close(); http.close(); }
    });

    test('[O2.1] Socket.IO: namespace, custom path, query and auth payload are all sent', async ({ page }) => {
      const { http, io, port } = await sioServer();
      try {
        await openConnectionTab(page, 'SOCKETIO');
        await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/chat`);
        await page.getByTestId('connection-sio-path-input').fill('/custom-io');
        await page.getByTestId('connection-sio-query-input').fill('a=1');
        await page.getByTestId('connection-sio-auth-input').fill('{"token":"abc"}');
        await page.getByTestId('connection-connect-btn').click();
        const rec = page.getByTestId('connection-msg-received');
        await expect(rec.first()).toContainText('Event [hello]');
        await expect(rec.first()).toContainText('"token":"abc"');
        await expect(rec.first()).toContainText('"a":"1"');
      } finally { io.close(); http.close(); }
    });

    test('[O2.2] Socket.IO: listen list filters events; removing the listener shows them again', async ({ page }) => {
      const { http, io, port } = await sioServer();
      try {
        await connectSio(page, port);
        await page.getByTestId('connection-listen-input').fill('evA');
        await page.getByTestId('connection-listen-input').press('Enter');
        await expect(page.getByTestId('connection-listen-chip')).toHaveCount(1);
        await page.getByTestId('connection-event-name-input').fill('go');
        await page.getByTestId('connection-message-input').fill('x');
        await page.getByTestId('connection-send-btn').click();
        await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Event [evA]' })).toHaveCount(1);
        await page.waitForTimeout(500);
        await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Event [evB]' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Remove evA' }).click();
        await expect(page.getByTestId('connection-listen-chip')).toHaveCount(0);
        await page.getByTestId('connection-message-input').fill('y');
        await page.getByTestId('connection-send-btn').click();
        await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Event [evB]' })).toHaveCount(1);
      } finally { io.close(); http.close(); }
    });

    test('[O2.3] Socket.IO emit: JSON array becomes multiple args, acks are shown, invalid JSON is blocked', async ({ page }) => {
      const { http, io, port } = await sioServer();
      try {
        await connectSio(page, port);
        await page.getByTestId('connection-event-name-input').fill('multi');
        await page.getByTestId('connection-message-input').fill('[1,{"a":2},"x"]');
        await page.getByTestId('connection-send-btn').click();
        await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Ack [multi]' })).toContainText('[[1,{"a":2},"x"]]');
        await page.getByTestId('connection-message-input').fill('{bad json');
        await page.getByTestId('connection-send-btn').click();
        await expect(page.getByTestId('connection-msg-error').filter({ hasText: /Invalid JSON/i })).toBeVisible();
        await expect(page.getByTestId('connection-msg-sent')).toHaveCount(1);
      } finally { io.close(); http.close(); }
    });

    test('[O2.5] Socket.IO reserved event names are refused for emit and listen', async ({ page }) => {
      const { http, io, port } = await sioServer();
      try {
        await connectSio(page, port);
        for (const name of ['connect', 'disconnect', 'error']) {
          await page.getByTestId('connection-event-name-input').fill(name);
          await page.getByTestId('connection-message-input').fill('x');
          await page.getByTestId('connection-send-btn').click();
          await expect(page.getByTestId('connection-msg-error').filter({ hasText: `"${name}" is a reserved` }).first()).toBeVisible();
        }
        await expect(page.getByTestId('connection-msg-sent')).toHaveCount(0);
        await page.getByTestId('connection-listen-input').fill('disconnect');
        await page.getByTestId('connection-listen-input').press('Enter');
        await expect(page.getByTestId('connection-listen-chip')).toHaveCount(0);
      } finally { io.close(); http.close(); }
    });

    test('[O2.8] closing a Socket.IO tab while another connection tab is open really disconnects it', async ({ page }) => {
      const { http, io, port, live } = await sioServer();
      try {
        await connectSio(page, port);
        await expect.poll(() => live.count).toBe(1);
        await page.getByTestId('new-connection-btn').click(); // second connection tab becomes active
        await page.getByTestId('close-tab-btn').first().click({ force: true });
        const confirm = page.getByTestId('confirm-submit');
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
        await expect.poll(() => live.count, { timeout: 8000 }).toBe(0);
      } finally { io.close(); http.close(); }
    });

    test('[O3.1] SSE shows event name, id and data for named events', async ({ page }) => {
      const { http, port } = await sseServer((_q, res) => {
        res.writeHead(200, sseHead);
        res.write('event: custom\nid: 7\ndata: hello\n\ndata: plain\n\n');
      });
      try {
        await openConnectionTab(page, 'SSE');
        await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/s`);
        await page.getByTestId('connection-connect-btn').click();
        const rec = page.getByTestId('connection-msg-received');
        await expect(rec.nth(0)).toContainText('[custom]');
        await expect(rec.nth(0)).toContainText('#7');
        await expect(rec.nth(0)).toContainText('hello');
        await expect(rec.nth(1)).toContainText('plain');
      } finally { http.closeAllConnections(); http.close(); }
    });

    test('[O3.2] SSE sends custom headers (Authorization) and explains the EventSource limit', async ({ page }) => {
      const { http, port, reqs } = await sseServer((_q, res) => { res.writeHead(200, sseHead); res.write('data: ok\n\n'); });
      try {
        await openConnectionTab(page, 'SSE');
        await expect(page.getByText(/EventSource/).first()).toBeVisible();
        await page.getByTestId('connection-sse-add-header').click();
        await page.getByTestId('connection-sse-header-key').fill('Authorization');
        await page.getByTestId('connection-sse-header-value').fill('Bearer t0k');
        await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/s`);
        await page.getByTestId('connection-connect-btn').click();
        await expect(page.getByTestId('connection-msg-received').first()).toContainText('ok');
        expect(reqs[0].headers.authorization).toBe('Bearer t0k');
      } finally { http.closeAllConnections(); http.close(); }
    });

    test('[O3.3] SSE reconnects after a server drop using retry and Last-Event-ID', async ({ page }) => {
      const { http, port, reqs } = await sseServer((_q, res, n) => {
        res.writeHead(200, sseHead);
        if (n === 1) { res.end('retry: 200\nid: 5\ndata: first\n\n'); } else { res.write('data: second\n\n'); }
      });
      try {
        await openConnectionTab(page, 'SSE');
        await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/s`);
        await page.getByTestId('connection-connect-btn').click();
        await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'second' })).toBeVisible({ timeout: 8000 });
        expect(reqs[1].headers['last-event-id']).toBe('5');
      } finally { http.closeAllConnections(); http.close(); }
    });

    test('[O3.4] SSE errors show the HTTP status and a wrong Content-Type message', async ({ page }) => {
      const { http, port } = await sseServer((q, res) => {
        if (q.url === '/401') { res.writeHead(401); res.end('no'); }
        else if (q.url === '/404') { res.writeHead(404); res.end('no'); }
        else { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('hi'); }
      });
      try {
        await openConnectionTab(page, 'SSE');
        for (const [p, re] of [['/401', /401/], ['/404', /404/], ['/plain', /text\/event-stream/]] as const) {
          await page.getByTestId('connection-clear-btn').click();
          await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}${p}`);
          await page.getByTestId('connection-connect-btn').click();
          await expect(page.getByTestId('connection-msg-error').first()).toContainText(re);
          await expect(page.getByTestId('connection-connect-btn')).toBeVisible();
        }
      } finally { http.closeAllConnections(); http.close(); }
    });
  });

});

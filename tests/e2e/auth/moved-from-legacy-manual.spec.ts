import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { registerUser, loginUi, apiAs, apiAsAdmin, treeNode, openNodeMenu, addViaMenu, createCollectionUi, selectWorkspace } from '../helpers';
import { createServer, type Server, type IncomingMessage } from 'http';
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

    test('[A1.10] double-clicking Sign In sends a single login request', async ({ page }) => {
      const { email } = await newUser('a110');
      let logins = 0;
      await page.route('**/api/auth/login', async route => {
        logins++;
        await new Promise(r => setTimeout(r, 400));
        await route.continue();
      });
      await page.goto('/login');
      await page.getByTestId('login-email').fill(email);
      await page.getByTestId('login-password').fill('password123');
      await page.getByTestId('login-submit').dblclick();
      await expect(page.getByTestId('workspace-select')).toBeVisible();
      expect(logins).toBe(1);
    });

    test('[A1.11] a signed-in user opening /login is sent to the app', async ({ page }) => {
      await registerUser(page, 'a111');
      await page.goto('/login');
      await expect(page.getByTestId('workspace-select')).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    });

    test('[A4.6] logging out while offline still clears the session and lands on /login', async ({ page }) => {
      await registerUser(page, 'a46');
      // The logout request fails at the network level (server unreachable).
      await page.route('**/api/auth/logout', route => route.abort('internetdisconnected'));
      await page.getByTestId('logout-btn').click();
      await expect(page).toHaveURL(/\/login/);
    });
  });

});

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

  test.describe('A — auth & accounts (API)', () => {
    test('[A1.6] login trims whitespace around the email', async () => {
      const { email } = await newUser('a16');
      const ctx = await anon();
      const res = await ctx.post('/api/auth/login', { data: { email: `  ${email}  `, password: 'password123' } });
      expect(res.status()).toBe(200);
    });

    test('[A1.7] login rejects malformed emails with 400, not 401', async () => {
      const ctx = await anon();
      for (const bad of ['a@', '@b.com', 'a@b']) {
        const res = await ctx.post('/api/auth/login', { data: { email: bad, password: 'whatever12' } });
        expect(res.status(), bad).toBe(400);
      }
    });

    test('[A2.5] register validates email, empty name, long name and HTML name', async () => {
      const ctx = await anon();
      const base = { password: 'password123' };
      const cases: Array<[string, Record<string, unknown>]> = [
        ['bad email', { name: 'X', email: 'abc' }],
        ['empty name', { name: '   ', email: `${uniq('a25')}@example.com` }],
        ['very long name', { name: 'x'.repeat(5000), email: `${uniq('a25')}@example.com` }],
      ];
      for (const [label, data] of cases) {
        const res = await ctx.post('/api/auth/register', { data: { ...base, ...data } });
        expect(res.status(), label).toBe(400);
      }
      // An HTML name is either rejected or stored escaped — never stored verbatim.
      const email = `${uniq('a25')}@example.com`;
      const res = await ctx.post('/api/auth/register', { data: { ...base, name: '<img src=x onerror=alert(1)>', email } });
      if (res.status() === 201) {
        const me = await (await ctx.get('/api/auth/me')).json();
        expect(JSON.stringify(me)).not.toContain('<img');
      } else {
        expect(res.status()).toBe(400);
      }
    });

    test('[A2.7] two simultaneous registrations of the same email: one 201, one 409, never 500', async () => {
      const email = `${uniq('a27')}@example.com`;
      const [a, b] = await Promise.all([anon(), anon()]);
      const [ra, rb] = await Promise.all([
        a.post('/api/auth/register', { data: { name: 'A', email, password: 'password123' } }),
        b.post('/api/auth/register', { data: { name: 'B', email, password: 'password123' } }),
      ]);
      const codes = [ra.status(), rb.status()].sort();
      expect(codes).toEqual([201, 409]);
    });

    test('[A4.2] logout revokes the token on the server', async () => {
      const { ctx } = await newUser('a42');
      const cookies = await ctx.storageState();
      const token = cookies.cookies.find((c) => /token|jwt|auth/i.test(c.name))!;
      expect(token).toBeTruthy();
      await ctx.post('/api/auth/logout');
      const replay = await pwRequest.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { 'X-Forwarded-For': ip(), Cookie: `${token.name}=${token.value}` },
      });
      expect((await replay.get('/api/auth/me')).status()).toBe(401);
    });

    test('[A5.2] password change to the same password is refused', async () => {
      const { ctx } = await newUser('a52');
      const res = await ctx.post('/api/auth/change-password', { data: { currentPassword: 'password123', newPassword: 'password123' } });
      expect(res.status()).toBe(400);
    });

    test('[A5.8] password change revokes other active sessions of the same user', async () => {
      const { ctx, email } = await newUser('a58');
      const second = await apiAs(email);
      expect((await second.get('/api/auth/me')).status()).toBe(200);
      const res = await ctx.post('/api/auth/change-password', { data: { currentPassword: 'password123', newPassword: 'password456' } });
      expect(res.status()).toBe(200);
      expect((await second.get('/api/auth/me')).status()).toBe(401);
      expect((await ctx.get('/api/auth/me')).status(), 'the session that changed it survives').toBe(200);
    });

    test('[A8.3] identity headers are ignored (header auth was removed)', async () => {
      const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip(), 'X-Auth-User': 'admin', 'X-Remote-User': 'admin' } });
      expect((await ctx.get('/api/auth/me')).status()).toBe(401);
    });
  });

  test.describe('R — server (API)', () => {
    test('[R5.5] a spoofed X-Forwarded-For does not bypass the login rate limit @ratelimit', async () => {
      test.skip(process.env.DISABLE_RATE_LIMIT === 'true', 'needs the limiters on: DISABLE_RATE_LIMIT=false npx playwright test -g @ratelimit');
      const victim = `${uniq('r55')}@example.com`;
      const ctx = await pwRequest.newContext({ baseURL: API_URL });
      let blocked = false;
      for (let i = 0; i < 25 && !blocked; i++) {
        const res = await ctx.post('/api/auth/login', {
          data: { email: victim, password: 'wrong-password' },
          headers: { 'X-Forwarded-For': `198.51.100.${i + 1}` },
        });
        if (res.status() === 429) blocked = true;
      }
      expect(blocked, 'rotating XFF must not reset the limit').toBe(true);
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

  test.describe('E — auth tokens', () => {
    test('[E1.1] bearer token resolves {{token}} from the environment; an empty token sends no header', async ({ page }) => {
      const seen = await mockServer(page);
      await scene(page, { request: { auth: { type: 'bearer', bearer: { token: '{{tok}}' } } }, env: [v('tok', 'abc123')] });
      await send(page);
      await expect(status(page)).toContainText('200');
      expect(seen.at(-1)!.headers['authorization']).toBe('Bearer abc123');
      await page.getByTestId('req-tab-authorization').click();
      await page.getByTestId('auth-bearer-token').fill('');
      await send(page);
      await expect.poll(() => seen.length).toBe(2);
      expect(seen.at(-1)!.headers['authorization']).toBeUndefined();
    });

    test('[E4.2] a custom bearer prefix is sent in the Authorization header', async ({ page }) => {
      const seen = await mockServer(page);
      await scene(page, { request: { auth: { type: 'bearer', bearer: { token: 'tk', prefix: 'Token' } } } });
      await send(page);
      await expect(status(page)).toContainText('200');
      expect(seen.at(-1)!.headers['authorization']).toBe('Token tk');
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
    test('[P4.4] invalid certificate files are rejected with a clear 400 message', async () => {
      const { ctx } = await newUserCtx('p44');
      const post = (data: object) => ctx.post('/api/auth/certificates', { data: { hostname: 'h.test', ...data } });
      let r = await post({ cert: 'just some text', key: 'more text' });
      expect(r.status()).toBe(400);
      expect((await r.json()).message).toMatch(/certificate/i);
      r = await post({ cert: KEY_PEM, key: KEY_PEM });
      expect(r.status()).toBe(400);
      const enc = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'right' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
      r = await post({ cert: CERT_PEM, key: enc.privateKey });
      expect(r.status()).toBe(400);
      expect((await r.json()).message).toMatch(/passphrase/i);
      r = await post({ cert: CERT_PEM, key: enc.privateKey, passphrase: 'wrong' });
      expect(r.status()).toBe(400);
      expect((await r.json()).message).toMatch(/passphrase/i);
      r = await post({ cert: CERT_PEM, key: enc.privateKey, passphrase: 'right' });
      expect(r.status()).toBe(400); // valid key, but does not match the certificate
      expect((await r.json()).message).toMatch(/match/i);
    });

    test('[P4.8] a second certificate for the same hostname (any case) replaces the first', async () => {
      const { ctx } = await newUserCtx('p48');
      expect((await ctx.post('/api/auth/certificates', { data: { hostname: 'Dup.Example.com', cert: CERT_PEM, key: KEY_PEM } })).status()).toBe(201);
      const r = await ctx.post('/api/auth/certificates', { data: { hostname: 'dup.example.com', cert: CERT_PEM, key: KEY_PEM } });
      expect(r.status()).toBe(201);
      expect((await r.json())).toHaveLength(1);
    });
  });

});

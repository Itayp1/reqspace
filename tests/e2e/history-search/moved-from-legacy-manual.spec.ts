import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { apiAs, apiAsAdmin, openNodeMenu, registerUser, treeNode, selectWorkspace } from '../helpers';
import fs from 'fs';
import { createServer, type Server, type IncomingMessage } from 'http';
import crypto from 'crypto';
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

  test.describe('K — history (API)', () => {
    const entry = (status: number) => ({
      requestSnapshot: { method: 'GET', url: 'http://example.test/x', headers: [], params: [] },
      responseBody: 'ok', responseStatus: status, responseStatusText: 'S', responseHeaders: {}, responseTime: 5, responseSize: 2,
    });

    test('[K1.3] history can be filtered by status code', async () => {
      const { ctx } = await newUser('k13');
      const wsId = await newWorkspace(ctx);
      await ctx.post(`/api/workspaces/${wsId}/history`, { data: entry(200) });
      await ctx.post(`/api/workspaces/${wsId}/history`, { data: entry(404) });
      const body = await (await ctx.get(`/api/workspaces/${wsId}/history?status=404`)).json();
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((i: any) => i.statusCode === 404)).toBe(true);
    });

    test('[K4.4] clearing history is scoped to one workspace', async () => {
      const { ctx } = await newUser('k44');
      const wsA = await newWorkspace(ctx);
      const wsB = await newWorkspace(ctx);
      await ctx.post(`/api/workspaces/${wsA}/history`, { data: entry(200) });
      await ctx.post(`/api/workspaces/${wsB}/history`, { data: entry(200) });
      await ctx.delete(`/api/workspaces/${wsA}/history`);
      expect((await (await ctx.get(`/api/workspaces/${wsB}/history`)).json()).items).toHaveLength(1);
    });
  });

});

test.describe('moved from legacy-manual (jklm)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]|Error parsing data file/] });

  /**
   * Group 4 of MANUAL_TEST_PLAN_FAILED.md: J (runner), K (history), L (import/export), M (share/fork).
   * Titles start with the plan id ("[J1.4] ..."). A still-broken bug is marked test.fail().
   */

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const idOf = (o: any) => (o.id ?? o._id) as string;

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }
  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    const wsList = await (await ctx.get('/api/workspaces')).json();
    const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
    const user = { ctx, email, wsId: idOf(ws) };
    userByEmail.set(email, user);
    return user;
  }
  type U = Awaited<ReturnType<typeof newUser>>;

  /** Login rate limit (15/15min per IP) makes UI logins unusable here: reuse the API session cookie instead. */
  const sessions = new Map<string, any[]>();
  async function loginUi(page: Page, email: string) {
    const u = userByEmail.get(email)!;
    if (!sessions.has(email)) sessions.set(email, (await u.ctx.storageState()).cookies);
    await page.context().addCookies(sessions.get(email)!);
    // The server's CSRF check only whitelists the dev origin :5173; this run's client is on another port.
    await page.context().route('**/api/**', async (r) => {
      if (r.request().method() === 'GET') return r.fallback();
      // The page may close mid-flight; an unhandled rejection here fails the whole run outside any test.
      try { const res = await r.fetch({ headers: { ...r.request().headers(), origin: 'http://localhost:5173' } }); await r.fulfill({ response: res }); } catch { /* page closed */ }
    });
    await page.goto('/');
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }
  const userByEmail = new Map<string, any>();

  async function mkCollection(ctx: APIRequestContext, wsId: string, name: string, reqs: Array<Record<string, any>> = []) {
    const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name } })).json();
    const out: any[] = [];
    for (const r of reqs) {
      const res = await ctx.post(`/api/collections/${idOf(col)}/requests`, { data: { method: 'GET', ...r } });
      expect(res.ok(), 'create request ' + (await res.text())).toBeTruthy();
      out.push(await res.json());
    }
    return { colId: idOf(col), reqs: out };
  }
  async function openRunner(page: Page, name: string) {
    await openNodeMenu(page, name);
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toBeVisible();
  }
  async function loginAndOpenRunner(page: Page, email: string, colName: string) {
    await loginUi(page, email);
    await openRunner(page, colName);
  }
  async function historyCount(ctx: APIRequestContext, wsId: string) {
    const b = await (await ctx.get(`/api/workspaces/${wsId}/history?limit=200`)).json();
    return (b.total ?? b.items.length) as number;
  }
  const hist = (status = 200, extra: Record<string, any> = {}) => ({
    requestSnapshot: { method: 'GET', url: 'http://h.test/x', headers: [], body: { mode: 'none' } },
    responseBody: 'ok', responseStatus: status, responseStatusText: 'OK', responseHeaders: {}, responseTime: 5, responseSize: 2, ...extra,
  });

  test.describe('J — runner', () => {
    test('[J1.12] a collection run is recorded in History', async ({ page }) => {
      const u = await newUser('j112');
      await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }, { name: 'B', url: 'http://runner-test.local/b' }]);
      await page.route('http://runner-test.local/*', (r) => r.fulfill({ status: 200, body: 'ok' }));
      await loginAndOpenRunner(page, u.email, 'RunCol');
      const before = await historyCount(u.ctx, u.wsId);
      await page.getByTestId('collection-runner-run-btn').click();
      await expect(page.getByTestId('collection-runner-export-btn')).toBeVisible();
      await page.waitForTimeout(500);
      expect(await historyCount(u.ctx, u.wsId)).toBe(before + 2);
    });
  });

  test.describe('K — history', () => {
    test('[K1.4] history UI pages through >50 entries (Load more) instead of loading only page 1', async ({ page }) => {
      const u = await newUser('k14');
      for (let i = 0; i < 60; i++) {
        await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist(200, { requestSnapshot: { method: 'GET', url: `http://h.test/${i}`, headers: [], body: { mode: 'none' } } }) });
      }
      await loginUi(page, u.email);
      await page.getByTestId('tab-history').click();
      await expect(page.getByTestId('history-item').first()).toBeVisible();
      expect(await page.getByTestId('history-item').count()).toBeLessThanOrEqual(50);
      await page.getByTestId('history-load-more').click();
      await expect(page.getByTestId('history-item')).toHaveCount(60);
    });

    test('[K1.7] a request that fails on the network is recorded in History', async ({ page }) => {
      const u = await newUser('k17');
      await page.route('http://down.test/**', (r) => r.abort('connectionrefused'));
      await loginUi(page, u.email);
      await page.getByTestId('new-tab-btn').click();
      await page.getByTestId('request-url-input').fill('http://down.test/x');
      await page.getByTestId('request-send-btn').click();
      await expect.poll(() => historyCount(u.ctx, u.wsId), { timeout: 8000 }).toBe(1);
    });

    test('[K1.9] a request sent in one tab appears in the History panel of another open tab', async ({ page, context }) => {
      test.skip(process.env.REQSPACE_TARGET === 'electron', 'needs a second page in one context; an Electron app context cannot create pages via CDP');
      const u = await newUser('k19');
      await context.route('http://sync.test/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
      await loginUi(page, u.email);
      const other = await context.newPage();
      await other.goto('/');
      await expect(other.getByTestId('workspace-select')).toBeVisible();
      await other.getByTestId('tab-history').click();
      await expect(other.getByTestId('history-item')).toHaveCount(0);
      await page.getByTestId('new-tab-btn').click();
      await page.getByTestId('request-url-input').fill('http://sync.test/ping');
      await page.getByTestId('request-send-btn').click();
      await expect(other.getByTestId('history-item').first()).toBeVisible({ timeout: 8000 });
    });

    test('[K2.4] two simultaneous saves of one history row do not create two requests', async () => {
      const u = await newUser('k24');
      const { colId } = await mkCollection(u.ctx, u.wsId, 'C');
      await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist() });
      const item = (await (await u.ctx.get(`/api/workspaces/${u.wsId}/history`)).json()).items[0];
      const body = { collectionId: colId, name: 'Saved once' };
      const [a, b] = await Promise.all([u.ctx.post(`/api/history/${idOf(item)}/save`, { data: body }), u.ctx.post(`/api/history/${idOf(item)}/save`, { data: body })]);
      expect(a.status(), await a.text()).toBeLessThan(300);
      const reqs = await (await u.ctx.get(`/api/collections/${colId}/requests`)).json();
      expect(reqs.filter((r: any) => r.name === 'Saved once').length, `${a.status()}/${b.status()}`).toBe(1);
    });

    test('[K3.2] a huge response body is truncated in history', async () => {
      const u = await newUser('k32');
      await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist(200, { responseBody: 'x'.repeat(3 * 1024 * 1024), responseSize: 3 * 1024 * 1024 }) });
      const item = (await (await u.ctx.get(`/api/workspaces/${u.wsId}/history`)).json()).items[0];
      const full = await (await u.ctx.get(`/api/history/${idOf(item)}`)).json();
      // The configured cap is 1 MB; the row exposes the same body twice (responseData / responseSnapshot).
      expect(JSON.stringify(full.responseData).length).toBeLessThan(1.2 * 1024 * 1024);
      expect(JSON.stringify(full.responseData)).toContain('[truncated]');
    });

    test('[K3.3] a 1 MB file in form-data is not stored as full base64 in history', async () => {
      const u = await newUser('k33');
      const b64 = Buffer.alloc(1024 * 1024, 7).toString('base64');
      const snap = { method: 'POST', url: 'http://h.test/up', headers: [], body: { mode: 'form-data', formData: [{ key: 'f', type: 'file', fileName: 'a.bin', value: b64, enabled: true }] } };
      await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist(200, { requestSnapshot: snap }) });
      const item = (await (await u.ctx.get(`/api/workspaces/${u.wsId}/history`)).json()).items[0];
      const full = await (await u.ctx.get(`/api/history/${idOf(item)}`)).json();
      expect(JSON.stringify(full).length).toBeLessThan(200 * 1024);
    });

    test('[K4.3] saving history can be switched off in Global Settings', async ({ page }) => {
      const u = await newUser('k43');
      await page.route('http://off.test/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
      await loginUi(page, u.email);
      await page.getByTestId('settings-btn').click();
      const toggle = page.locator('#saveHistory');
      await expect(toggle).toBeVisible();
      await toggle.uncheck();
      await expect(toggle).not.toBeChecked();
      await page.getByTestId('global-settings-close-btn').click();
      await page.getByTestId('new-tab-btn').click();
      await page.getByTestId('request-url-input').fill('http://off.test/x');
      await page.getByTestId('request-send-btn').click();
      await expect(page.getByTestId('response-status')).toContainText('200');
      await page.waitForTimeout(800);
      expect(await historyCount(u.ctx, u.wsId)).toBe(0);
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
    test('[P1.2] global search shows the Collection › Folder path and finds by method', async ({ page }) => {
      const email = await registerUser(page, 'p12');
      const api = await apiAs(email);
      const wsId = (await (await api.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id ?? undefined;
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'PathCol' } })).json();
      const colId = col.id ?? col._id;
      const folder = await (await api.post(`/api/collections/${colId}/folders`, { data: { name: 'PathFolder' } })).json();
      await api.post(`/api/collections/${colId}/requests`, { data: { name: 'DeepReq', method: 'DELETE', url: 'http://x.test/zz', folderId: folder.id ?? folder._id } });
      await page.reload();
      await page.getByTestId('node-PathCol').click();
      await expect(page.getByTestId('node-PathFolder')).toBeVisible();
      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: 'Global search' });
      await dialog.getByRole('combobox').fill('DeepReq');
      await expect(dialog.getByTestId('search-result-path').first()).toHaveText('PathCol › PathFolder');
      await dialog.getByRole('combobox').fill('delete');
      await expect(dialog.getByRole('option', { name: /request: DeepReq/ })).toBeVisible();
    });
  });

});

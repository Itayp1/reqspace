import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { registerUser, loginUi, apiAs, apiAsAdmin, treeNode, openNodeMenu, addViaMenu, createCollectionUi, selectWorkspace } from '../helpers';
import http from 'http';
import { type AddressInfo } from 'net';

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

  test.describe('C — collection tree', () => {
    test.use({ allowFpErrors: [/Network Error/] });

    test('[C2.4] renaming a request in the tree updates its open tab title', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c24');
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C24' } })).json();
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'OldReq', method: 'GET', url: 'https://c24.test' } });
      await page.reload();
      await treeNode(page, 'C24').click();
      await page.getByTestId('node-OldReq').click();
      await expect(tabs(page, 'OldReq')).toHaveCount(1);
      await treeNode(page, 'OldReq').dblclick();
      await page.getByTestId('inline-rename-input').fill('NewReq');
      await page.getByTestId('inline-rename-input').press('Enter');
      await expect(page.getByTestId('node-NewReq')).toBeVisible();
      await expect(tabs(page, 'NewReq')).toHaveCount(1);
      await expect(tabs(page, 'OldReq')).toHaveCount(0);
    });

    test('[C3.1] deleting a request closes (or marks) its open tab, so Save cannot 404', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c31');
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C31' } })).json();
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'Doomed', method: 'GET', url: 'https://c31.test' } });
      await page.reload();
      await treeNode(page, 'C31').click();
      await page.getByTestId('node-Doomed').click();
      await expect(tabs(page, 'Doomed')).toHaveCount(1);
      await openNodeMenu(page, 'Doomed');
      await menuItem(page, /delete/i).click();
      await page.getByTestId('confirm-btn').click();
      await expect(page.getByTestId('node-Doomed')).toHaveCount(0);
      await expect(tabs(page, 'Doomed')).toHaveCount(0);
    });

    test('[C7.1] filter shows the matching request inside an auto-opened folder, and nothing unrelated', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c71');
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C71' } })).json();
      const folder = await (await api.post(`/api/collections/${idOf(col)}/folders`, { data: { name: 'F1' } })).json();
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'copy me', method: 'GET', url: 'https://a.test', folderId: idOf(folder) } });
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'Health', method: 'GET', url: 'https://health.test' } });
      await page.reload();
      await page.getByPlaceholder('Filter requests...').fill('copy');
      await expect(page.getByTestId('node-copy me')).toBeVisible();
      await expect(page.getByTestId('node-Health')).toHaveCount(0);
    });

    test('[C7.2] tree filter is case-insensitive', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c72');
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C72' } })).json();
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'lowercasereq', method: 'GET', url: 'https://l.test' } });
      await page.reload();
      await page.getByPlaceholder('Filter requests...').fill('LOWERCASE');
      await expect(page.getByTestId('node-lowercasereq')).toBeVisible();
    });

    test('[C7.6] typing in the filter of a large tree stays responsive (<200ms per keystroke)', async ({ page }) => {
      test.setTimeout(240_000);
      const { api, wsId } = await seedTreeUser(page, 'c76');
      const items = Array.from({ length: 2000 }, (_, i) => ({ name: `bulk request ${i}`, request: { method: 'GET', url: { raw: `https://bulk.test/${i}` } } }));
      const imp = await api.post('/api/collections/import', {
        data: { workspaceId: wsId, collection: { info: { name: 'Big', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: items } },
      });
      expect(imp.ok(), await imp.text()).toBeTruthy();
      await page.reload();
      await treeNode(page, 'Big').click();
      await expect(page.getByTestId('node-bulk request 5')).toBeVisible();
      const lat = await page.evaluate(async () => {
        const el = document.querySelector('input[placeholder="Filter requests..."]') as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        const times: number[] = [];
        let v = '';
        for (const ch of 'bulk req') {
          v += ch;
          const t0 = performance.now();
          setter.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
          times.push(performance.now() - t0);
          await new Promise(r => setTimeout(r, 250));
        }
        return times;
      });
      const max = Math.max(...lat);
      expect(max, `latencies ${lat.map(x => Math.round(x)).join(',')}`).toBeLessThan(200);
    });

    test('[C9.5] collection documentation masks tokens and secrets until revealed', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c95');
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C95' } })).json();
      await api.post(`/api/collections/${idOf(col)}/requests`, {
        data: { name: 'Secret req', method: 'GET', url: 'https://s.test', headers: [{ key: 'Authorization', value: 'Bearer SUPERSECRETTOKEN123', enabled: true }] },
      });
      await page.reload();
      await openNodeMenu(page, 'C95');
      await menuItem(page, /documentation/i).click();
      const modal = page.getByTestId('documentation-modal');
      await expect(modal).toBeVisible();
      await expect(modal.getByTestId('doc-request-Secret req')).toBeVisible();
      await expect(modal).not.toContainText('SUPERSECRETTOKEN123');
      await modal.getByTestId('doc-reveal-btn').first().click();
      await expect(modal).toContainText('SUPERSECRETTOKEN123');
    });

    test('[C10.4] duplicating a request twice yields distinct names', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c104');
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C104' } })).json();
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'GetUser', method: 'GET', url: 'https://u.test' } });
      await page.reload();
      await treeNode(page, 'C104').click();
      for (let i = 0; i < 2; i++) {
        await openNodeMenu(page, 'GetUser');
        await menuItem(page, /duplicate/i).click();
        await expect(page.locator('[data-testid^="node-GetUser"]')).toHaveCount(i + 2);
      }
      const names = await page.locator('[data-testid^="node-GetUser"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
      expect(new Set(names).size).toBe(names.length);
    });

    test('[C10.5] a failure part-way through Copy to Workspace leaves no partial collection', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c105');
      const target = await (await api.post('/api/workspaces', { data: { name: uniq('Target') } })).json();
      const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C105' } })).json();
      for (const n of ['r1', 'r2', 'r3']) {
        await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: n, method: 'GET', url: `https://${n}.test` } });
      }
      await page.reload();
      let posts = 0;
      await page.route(/\/api\/collections\/[^/]+\/requests$/, async route => {
        if (route.request().method() === 'POST' && ++posts === 2) return route.abort('failed');
        return route.continue();
      });
      await openNodeMenu(page, 'C105');
      await menuItem(page, /copy to/i).click();
      await page.getByTestId('copy-target-workspace-select').selectOption(idOf(target));
      await page.getByRole('button', { name: /^copy$/i }).click();
      await page.waitForTimeout(1500);
      const cols = await (await api.get(`/api/workspaces/${idOf(target)}/collections`)).json();
      expect(cols.length, 'partial collection left in target').toBe(0);
    });

    test('[C10.6] Copy to Workspace dialog says variables/environments are not copied', async ({ page }) => {
      const { api, wsId } = await seedTreeUser(page, 'c106');
      await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C106' } });
      await page.reload();
      await openNodeMenu(page, 'C106');
      await menuItem(page, /copy to/i).click();
      await expect(page.getByTestId('copy-to-workspace-modal')).toContainText(/environments?.*not copied/i);
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

  test.describe('C — tree (API)', () => {
    test('[C2.2] renaming to an empty / whitespace-only name is rejected', async () => {
      const { ctx } = await newUser('c22');
      const wsId = await newWorkspace(ctx);
      const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const colId = col.id ?? col._id;
      expect((await ctx.put(`/api/collections/${colId}`, { data: { name: '   ' } })).status()).toBe(400);
      expect((await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: '   ' } })).status()).toBe(400);
    });

    test('[C3.5] deleting a request nested in a folder and one at the root both work', async () => {
      const { ctx } = await newUser('c35');
      const wsId = await newWorkspace(ctx);
      const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const colId = col.id ?? col._id;
      const folder = await (await ctx.post(`/api/collections/${colId}/folders`, { data: { name: 'F' } })).json();
      const nested = await (await ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'N', method: 'GET', url: 'http://x', folderId: folder.id ?? folder._id } })).json();
      const root = await (await ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'R', method: 'GET', url: 'http://x' } })).json();
      expect((await ctx.delete(`/api/requests/${nested.id ?? nested._id}`)).status()).toBe(200);
      expect((await ctx.delete(`/api/requests/${root.id ?? root._id}`)).status()).toBe(200);
      expect((await ctx.get(`/api/requests/${nested.id ?? nested._id}`)).status()).toBe(404);
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
      await selectWorkspace(pageV, wsId);
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
  });

});

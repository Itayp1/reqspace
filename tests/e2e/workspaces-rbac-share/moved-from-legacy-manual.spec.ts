import { test, expect, API_URL, expandAdminSections } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { registerUser, loginUi, apiAs, apiAsAdmin, treeNode, openNodeMenu, addViaMenu, createCollectionUi, selectWorkspace, loginAdminUi } from '../helpers';

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

  test.describe('B — workspaces realtime / UI', () => {
    test('[B4.7] member search is debounced: typing 5 chars quickly fires one /users/search', async ({ page }) => {
      await registerUser(page, 'b47');
      const searches: string[] = [];
      await page.route('**/api/users/search**', async route => {
        searches.push(new URL(route.request().url()).searchParams.get('q') || '');
        await route.continue();
      });
      await page.getByTestId('workspace-settings-btn').click();
      await page.getByTestId('workspace-members-tab').click();
      const input = page.getByPlaceholder(/email|user/i).first();
      await input.click();
      await input.pressSequentially('abcde', { delay: 30 });
      await page.waitForTimeout(900);
      expect(searches.length, `queries: ${searches.join(',')}`).toBeLessThanOrEqual(1);
    });
  });

  test.describe('C — collection tree', () => {
    test.use({ allowFpErrors: [/Network Error/] });

    test('[C1.8] a viewer is not offered editing actions in the tree menu', async ({ page }) => {
      const owner = await newUser('c18o');
      const viewerEmail = await registerUser(page, 'c18v');
      const wsId = await seedWorkspace(owner.ctx);
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).status()).toBe(201);
      await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'ViewerCol' } });
      await page.reload();
      await selectWorkspace(page, wsId);
      await expect(page.getByTestId('node-ViewerCol')).toBeVisible();
      await openNodeMenu(page, 'ViewerCol');
      for (const re of [/new request/i, /new folder/i, /rename/i, /delete/i, /duplicate/i]) {
        await expect(menuItem(page, re), String(re)).toHaveCount(0);
      }
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

  test.describe('B — workspaces & members (API)', () => {
    test('[B1.5] a personal workspace cannot be deleted', async () => {
      const { ctx } = await newUser('b15');
      const list = await (await ctx.get('/api/workspaces')).json();
      const arr: any[] = Array.isArray(list) ? list : list.workspaces;
      const personal = arr.find((w) => w.isPersonal);
      expect(personal, 'registration creates a personal workspace').toBeTruthy();
      const res = await ctx.delete(`/api/workspaces/${personal.id ?? personal._id}`);
      expect([400, 403, 409]).toContain(res.status());
    });

    test('[B2.2] a public workspace is listed for users who are not members', async () => {
      const owner = await newUser('b22o');
      const res = await owner.ctx.post('/api/workspaces', { data: { name: uniq('pub'), isPublic: true } });
      const ws = await res.json();
      const id = ws.id ?? ws._id;
      const other = await newUser('b22x');
      const list = await (await other.ctx.get('/api/workspaces')).json();
      const arr: any[] = Array.isArray(list) ? list : list.workspaces;
      expect(arr.some((w) => (w.id ?? w._id) === id)).toBe(true);
    });

    test('[B5.5] a role change is recorded in the workspace activity log', async () => {
      const owner = await newUser('b55o');
      const member = await newUser('b55m');
      const wsId = await newWorkspace(owner.ctx);
      await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: member.email, role: 'viewer' } });
      await owner.ctx.put(`/api/workspaces/${wsId}/members/${member.id}`, { data: { role: 'editor' } });
      const log: any[] = await (await owner.ctx.get(`/api/workspaces/${wsId}/activity`)).json();
      expect(log.some((l) => /role/i.test(l.action))).toBe(true);
    });

    test('[B6.3] an editor or viewer can leave a workspace on their own', async () => {
      const owner = await newUser('b63o');
      const editor = await newUser('b63e');
      const viewer = await newUser('b63v');
      const wsId = await newWorkspace(owner.ctx);
      await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: editor.email, role: 'editor' } });
      await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewer.email, role: 'viewer' } });
      expect((await editor.ctx.delete(`/api/workspaces/${wsId}/members/${editor.id}`)).status()).toBe(200);
      expect((await viewer.ctx.delete(`/api/workspaces/${wsId}/members/${viewer.id}`)).status()).toBe(200);
    });

    test('[B7.1] the workspace activity log records collection / request / folder changes', async () => {
      const { ctx } = await newUser('b71');
      const wsId = await newWorkspace(ctx);
      const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const colId = col.id ?? col._id;
      await ctx.post(`/api/collections/${colId}/folders`, { data: { name: 'F' } });
      await ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'R', method: 'GET', url: 'http://x' } });
      const log: any[] = await (await ctx.get(`/api/workspaces/${wsId}/activity`)).json();
      const actions = log.map((l) => String(l.action));
      expect(actions.some((a) => /collection/i.test(a)), actions.join(',')).toBe(true);
      expect(actions.some((a) => /folder/i.test(a)), actions.join(',')).toBe(true);
      expect(actions.some((a) => /request/i.test(a)), actions.join(',')).toBe(true);
    });

    test('[B7.2] the activity endpoint pages past 50 entries', async () => {
      const { ctx } = await newUser('b72');
      const wsId = await newWorkspace(ctx);
      for (let i = 0; i < 3; i++) await ctx.put(`/api/workspaces/${wsId}`, { data: { name: uniq('rename') } });
      const first: any[] = await (await ctx.get(`/api/workspaces/${wsId}/activity?limit=1`)).json();
      const second: any[] = await (await ctx.get(`/api/workspaces/${wsId}/activity?limit=1&skip=1`)).json();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(second[0]._id ?? second[0].id).not.toBe(first[0]._id ?? first[0].id);
    });
  });

  test.describe('C — tree (API)', () => {
    test('[D6.2] after a viewer-demotion, writes answer 403 immediately', async () => {
      const owner = await newUser('d62o');
      const member = await newUser('d62m');
      const wsId = await newWorkspace(owner.ctx);
      await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: member.email, role: 'editor' } });
      const col = await (await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const colId = col.id ?? col._id;
      expect((await member.ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'ok', method: 'GET', url: 'http://x' } })).status()).toBe(201);
      await owner.ctx.put(`/api/workspaces/${wsId}/members/${member.id}`, { data: { role: 'viewer' } });
      expect((await member.ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'no', method: 'GET', url: 'http://x' } })).status()).toBe(403);
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

  test.describe('M — share & fork', () => {
    async function share(ctx: APIRequestContext, colId: string) {
      const res = await ctx.post(`/api/share/collection/${colId}`, { data: {} });
      expect(res.ok(), await res.text()).toBeTruthy();
      const b = await res.json();
      return (b.shortId ?? b.url?.split('/').pop()) as string;
    }

    test('[M1.2] public share view does not leak secrets from the URL query or auth', async () => {
      const u = await newUser('m12');
      const { colId } = await mkCollection(u.ctx, u.wsId, 'Shared', [{
        name: 'S', url: 'http://x.test/a?access_token=SUPERSECRET&q=1',
        auth: { type: 'bearer', bearer: { token: 'BEARERSECRET' } },
        headers: [{ key: 'Authorization', value: 'Bearer HDRSECRET', enabled: true }],
      }]);
      const id = await share(u.ctx, colId);
      const text = await (await (await anon()).get(`/api/share/${id}`)).text();
      for (const s of ['SUPERSECRET', 'BEARERSECRET', 'HDRSECRET']) expect(text, s).not.toContain(s);
    });

    test('[M1.3] anonymous holder of a share link cannot write', async () => {
      const u = await newUser('m13');
      const { colId, reqs } = await mkCollection(u.ctx, u.wsId, 'Shared', [{ name: 'S', url: 'http://x.test' }]);
      const id = await share(u.ctx, colId);
      const a = await anon();
      expect((await a.put(`/api/requests/${idOf(reqs[0])}`, { data: { name: 'hacked' } })).status()).toBe(401);
      expect((await a.delete(`/api/share/${id}`)).status()).toBe(401);
      expect((await a.post(`/api/share/collection/${colId}`, { data: {} })).status()).toBe(401);
    });

    test('[M1.3b] BUG-03: share links of a collection can be listed after the dialog closes', async () => {
      const u = await newUser('m13b');
      const { colId } = await mkCollection(u.ctx, u.wsId, 'Shared');
      const id = await share(u.ctx, colId);
      const res = await u.ctx.get(`/api/share/collection/${colId}/links`);
      expect(res.status()).toBe(200);
      expect(JSON.stringify(await res.json())).toContain(id);
    });

    test('[M1.7] invalid share ids (NUL byte, long, SQLi, traversal) answer 404, never 500', async () => {
      const a = await anon();
      for (const bad of ['%00', 'a'.repeat(1000), '%27%20OR%201=1--', '%2e%2e%2fadmin', 'zz%00zz']) {
        const res = await a.get(`/api/share/${bad}`);
        // A NUL byte in the path is rejected up front as a 400 (server/src/index.ts); the rest are plain 404s.
        // What this guards is "never 500".
        expect([400, 404], bad).toContain(res.status());
      }
    });

    test('[M1.14] share page shows a Fork button to a logged-in user and forks', async ({ page }) => {
      const u = await newUser('m114');
      const { colId } = await mkCollection(u.ctx, u.wsId, 'Shared', [{ name: 'S', url: 'http://x.test' }]);
      const id = await share(u.ctx, colId);
      await loginUi(page, u.email);
      await page.goto(`/share/${id}`);
      await expect(page.getByTestId('share-page-fork')).toBeVisible();
      await page.getByTestId('share-page-fork').click();
      await expect.poll(async () => (await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json()).length).toBe(2);
    });

    test('[M2.6] a second fork of the same source collection succeeds (no 500)', async () => {
      const u = await newUser('m26');
      const w1 = await (await u.ctx.post('/api/workspaces', { data: { name: uniq('team') } })).json();
      const { colId } = await mkCollection(u.ctx, idOf(w1), 'Src', [{ name: 'S', url: 'http://x.test' }]);
      for (let i = 0; i < 2; i++) {
        const res = await u.ctx.post(`/api/collections/${colId}/fork`, { data: { targetWorkspaceId: u.wsId, name: `Fork ${i}` } });
        expect(res.status(), await res.text()).toBe(201);
      }
    });

    test('[M3.1] fork options work from a team workspace into the admin personal workspace', async () => {
      const admin = await apiAsAdmin();
      const wsList = await (await admin.get('/api/workspaces')).json();
      const personal = wsList.find((w: any) => w.isPersonal);
      expect(personal, 'admin has a personal workspace').toBeTruthy();
      const team = await (await admin.post('/api/workspaces', { data: { name: uniq('team') } })).json();
      const { colId } = await mkCollection(admin, idOf(team), 'TeamSrc', [{ name: 'S', url: 'http://x.test' }]);
      const res = await admin.post(`/api/collections/${colId}/fork`, { data: { targetWorkspaceId: idOf(personal), name: uniq('forkM31') } });
      expect(res.status(), await res.text()).toBe(201);
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
    test('[R1.1] a DB connection failure shows a "Database Connection Error" gate while /api/health keeps answering', async () => {
      expect(src('server/src/index.ts')).toMatch(/dbGate|503/);
      expect(src('client/src/App.tsx')).toContain('Database Connection Error');
      const health = await (await (await anon()).get('/api/health')).json();
      expect(health.status).toBe('ok');
    });
  });

});

test.describe('moved from legacy-manual (pass-bugs)', () => {

  test.describe('Manual-pass bugs (regressions of bugs found by hand)', () => {
    test('BUG-03: an existing share link is still visible (and revocable) after the dialog is reopened', async ({ page }) => {
      await registerUser(page, 'bugshare');
      await createCollectionUi(page, 'Shared Later');
      await openNodeMenu(page, 'Shared Later');
      await page.getByTestId('action-menu-share-via-link').click();
      await page.getByTestId('share-link-generate-btn').click();
      await expect(page.getByTestId('share-link-result')).toBeVisible();
      await page.getByTestId('share-link-modal').getByRole('button', { name: 'Done' }).click();

      await openNodeMenu(page, 'Shared Later');
      await page.getByTestId('action-menu-share-via-link').click();
      await expect(page.getByTestId('share-link-modal')).toBeVisible();
      // The dialog lists links created earlier ("Active links") and lets the owner revoke them.
      await expect(page.getByTestId('share-link-existing-row')).toHaveCount(1);
      await page.getByTestId('share-link-existing-revoke').click();
      await expect(page.getByTestId('share-link-existing-row')).toHaveCount(0);
    });
  });

});

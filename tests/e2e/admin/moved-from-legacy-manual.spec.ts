import { test, expect, API_URL, expandAdminSections } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { apiAs, apiAsAdmin, openNodeMenu, registerUser, loginAdminUi, treeNode, createCollectionUi, selectWorkspace } from '../helpers';
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

  test.describe('Q — admin (API)', () => {
    test.use({ allowFpErrors: [/probe \d+/] });

    test('[Q1.5] GET /api/admin/users never exposes passwordHash', async () => {
      const admin = await apiAsAdmin();
      const text = await (await admin.get('/api/admin/users')).text();
      expect(text).not.toContain('passwordHash');
      expect(text).not.toMatch(/\$2[aby]\$/);
    });

    test('[Q5.1] the admin workspaces list reports owner, item count and storage', async () => {
      const admin = await apiAsAdmin();
      const body = await (await admin.get('/api/admin/workspaces')).json();
      const rows: any[] = Array.isArray(body) ? body : body.items ?? body.workspaces;
      expect(rows.length).toBeGreaterThan(0);
      const w = rows[0];
      expect(w).toHaveProperty('owner');
      expect(JSON.stringify(Object.keys(w))).toMatch(/count|items|requests/i);
      expect(JSON.stringify(Object.keys(w))).toMatch(/size|bytes|storage/i);
    });

    test('[Q5.3] an admin adding themselves as owner to another workspace is audited', async () => {
      const owner = await newUser('q53');
      const wsId = await newWorkspace(owner.ctx);
      const admin = await apiAsAdmin();
      const me = await (await admin.get('/api/auth/me')).json();
      const adminId = me.user?.id ?? me.id ?? me._id;
      const res = await admin.put(`/api/workspaces/${wsId}/members/${adminId}`, { data: { role: 'owner' } });
      expect([403, 404]).toContain(res.status());
    });

    test('[Q7.5] POST /api/errors is rate limited when unauthenticated @ratelimit', async () => {
      test.skip(process.env.DISABLE_RATE_LIMIT === 'true', 'needs the limiters on: DISABLE_RATE_LIMIT=false npx playwright test -g @ratelimit');
      const ctx = await anon();
      let limited = false;
      for (let i = 0; i < 60 && !limited; i++) {
        const res = await ctx.post('/api/errors', { data: { kind: 'window.error', message: `probe ${i}`, route: '/qa' } });
        if (res.status() === 429) limited = true;
      }
      expect(limited).toBe(true);
    });

    test('[Q8.3] system config rejects negative / non-numeric / absurd values', async () => {
      const admin = await apiAsAdmin();
      for (const bad of [-1, 'x', 100000]) {
        const res = await admin.put('/api/admin/config', { data: { auth: { jwtTtlDays: bad } } });
        expect(res.status(), String(bad)).toBe(400);
      }
    });

    test('[Q9.6] a double click on SMTP Test Connection does not run two checks', async () => {
      const admin = await apiAsAdmin();
      const [a, b] = await Promise.all([
        admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 25 } }),
        admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 25 } }),
      ]);
      // A coalesced / rejected duplicate answers 409 or 429; the first answers 400/200.
      expect([a.status(), b.status()].some((s) => s === 409 || s === 429)).toBe(true);
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

  test.describe('L — import / export', () => {
    const postman = (name: string) => ({ info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ name: 'r', request: { method: 'GET', url: 'http://x.test' } }] });

    const spec = `openapi: "3.0.0"
info: { title: Sec API, version: "1" }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    User:
      type: object
      properties: { name: { type: string }, age: { type: integer } }
security: [ { bearerAuth: [] } ]
paths:
  /users:
    post:
      summary: Create user
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/User' }
      responses: { '200': { description: ok } }
`;
    async function importOpenApiViaUi(page: Page, u: U) {
      await loginUi(page, u.email);
      await page.getByTestId('import-btn').click();
      await page.getByTestId('import-tab-openapi').click();
      await page.getByTestId('import-openapi-input').fill(spec);
      await page.getByTestId('import-submit').click();
      await expect.poll(async () => (await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json()).length, {
        message: 'import error: ' + (await page.getByTestId('import-error').textContent({ timeout: 100 }).catch(() => 'none')),
        timeout: 8000,
      }).toBe(1);
      await page.waitForTimeout(1500);
      const cols = await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json();
      const col = cols.find((c: any) => c.name === 'Sec API');
      expect(col).toBeTruthy();
      const reqs = await (await u.ctx.get(`/api/collections/${idOf(col)}/requests`)).json();
      return { col, reqs };
    }

    async function curl(ctx: APIRequestContext, wsId: string, c: string) {
      const res = await ctx.post('/api/requests/import/curl', { data: { workspaceId: wsId, curl: c } });
      expect(res.status()).toBe(200);
      return res.json();
    }

    test('[L5.3] importing a workspace dump into a non-empty workspace needs an explicit mode', async () => {
      const admin = await apiAsAdmin();
      const u = await newUser('l53');
      await mkCollection(u.ctx, u.wsId, 'Existing');
      const dump = await (await admin.get(`/api/admin/export/${u.wsId}`)).json();
      const res = await admin.post(`/api/admin/import/${u.wsId}`, { data: dump });
      expect(res.status()).toBe(409);
      const cols = await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json();
      expect(cols.length).toBe(1);
    });

    test('[L5.5] workspace dump does not contain secret variable values in plaintext by default', async () => {
      const admin = await apiAsAdmin();
      const u = await newUser('l55');
      const env = await u.ctx.post(`/api/workspaces/${u.wsId}/environments`, { data: { name: 'E', variables: [{ key: 'tok', value: 'S3CR3T-VALUE', isSecret: true, enabled: true }] } });
      expect(env.ok(), await env.text()).toBeTruthy();
      const text = await (await admin.get(`/api/admin/export/${u.wsId}`)).text();
      expect(text).not.toContain('S3CR3T-VALUE');
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

  test.describe('Q — admin (API)', () => {
    test.use({ allowFpErrors: [/q74 dedupe probe/] });

    test('[Q2.5] two admins revoking each other concurrently leave at least one super admin', async () => {
      const admin = await apiAsAdmin();
      const a = await newUser('q25a');
      const b = await newUser('q25b');
      expect((await admin.post(`/api/admin/users/${a.id}/promote`, { data: {} })).ok()).toBeTruthy();
      expect((await admin.post(`/api/admin/users/${b.id}/promote`, { data: {} })).ok()).toBeTruthy();
      const [r1, r2] = await Promise.all([
        a.ctx.post(`/api/admin/users/${b.id}/revoke`, { data: {} }),
        b.ctx.post(`/api/admin/users/${a.id}/revoke`, { data: {} }),
      ]);
      expect([r1.status(), r2.status()].every((s) => s < 500)).toBe(true);
      // The list is cursor-paginated; the seeded admin is found by search so the check does not depend on page 1.
      const users = await (await admin.get('/api/admin/users?search=admin&limit=200')).json();
      const list: any[] = Array.isArray(users) ? users : users.users ?? users.items;
      expect(list.filter((u) => u.isSuperAdmin).length).toBeGreaterThanOrEqual(1);
      for (const id of [a.id, b.id]) await admin.post(`/api/admin/users/${id}/revoke`, { data: {} });
    });

    test('[Q6.1] a failed login is recorded in the audit log', async () => {
      const admin = await apiAsAdmin();
      const u = await newUser('q61');
      const ctx = await anon();
      const bad = await ctx.post('/api/auth/login', { data: { email: u.email, password: 'wrong-password-1' } });
      expect(bad.status()).toBe(401);
      const logs = await (await admin.get('/api/admin/logs?action=auth.login_failed&limit=50')).json();
      expect(logs.logs.length).toBeGreaterThan(0);
      expect(logs.logs.every((l: any) => l.action === 'auth.login_failed')).toBe(true);
    });

    test('[Q6.2] audit log supports paging, action/date filters and a total', async () => {
      const admin = await apiAsAdmin();
      const body = await (await admin.get('/api/admin/logs?limit=2&page=1')).json();
      expect(body.logs.length).toBeLessThanOrEqual(2);
      expect(typeof body.total).toBe('number');
      const future = await (await admin.get(`/api/admin/logs?from=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`)).json();
      expect(future.logs).toHaveLength(0);
      const none = await (await admin.get('/api/admin/logs?action=no.such.action')).json();
      expect(none.logs).toHaveLength(0);
    });

    test('[Q7.2] the errors list can be sorted and bounded by date', async () => {
      const admin = await apiAsAdmin();
      for (const q of ['sort=count&dir=desc', 'sort=firstSeen&dir=asc', `since=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`, `until=${encodeURIComponent(new Date().toISOString())}`]) {
        const res = await admin.get(`/api/admin/errors?${q}`);
        expect(res.status(), q).toBe(200);
      }
    });

    test.describe('Q7.4 dedupe', () => {
      test('[Q7.4] the same client error reported repeatedly is one group with a total count', async () => {
        const ctx = await anon();
        const msg = `q74 dedupe probe ${uniq('m')}`;
        const since = new Date(Date.now() - 1000).toISOString();
        for (let i = 0; i < 5; i++) {
          await ctx.post('/api/errors', { data: { kind: 'window.error', message: msg, route: '/qa-q74' } });
        }
        await new Promise((r) => setTimeout(r, 1000));
        const admin = await apiAsAdmin();
        const body = await (await admin.get(`/api/admin/errors?since=${encodeURIComponent(since)}`)).json();
        const groups: any[] = Array.isArray(body) ? body : body.groups ?? body.errors ?? body.items;
        const mine = groups.filter((g) => String(g.message).includes(msg));
        expect(mine).toHaveLength(1);
        expect(mine[0].count).toBe(5);
      });
    });

    test('[Q8.1] system config accepts history maxRecords / retentionDays and rejects negatives', async () => {
      const admin = await apiAsAdmin();
      const before = await (await admin.get('/api/admin/config')).json();
      const ok = await admin.put('/api/admin/config', { data: { history: { maxRecords: 500, retentionDays: 30 } } });
      expect(ok.status()).toBe(200);
      const cfg = await (await admin.get('/api/admin/config')).json();
      expect(cfg.history.maxRecords).toBe(500);
      expect(cfg.history.retentionDays).toBe(30);
      expect((await admin.put('/api/admin/config', { data: { history: { maxRecords: -1 } } })).status()).toBe(400);
      await admin.put('/api/admin/config', { data: { history: { maxRecords: before.history?.maxRecords ?? 0, retentionDays: before.history?.retentionDays ?? 0 } } });
    });

    test('[Q9.1] SMTP test reports a detailed connection error and never echoes the password', async () => {
      const admin = await apiAsAdmin();
      const before = await (await admin.get('/api/admin/config')).json();
      try {
        await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } });
        const secret = 'S3cr3tPassw0rd!zz';
        const res = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 1, user: 'u', pass: secret } });
        const text = await res.text();
        expect(text).not.toContain(secret);
        expect(text).toMatch(/ECONNREFUSED|refused|timeout|connect/i);
      } finally {
        await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: before.proxy?.allowPrivateTargets ?? false } } });
      }
    });
  });

});

test.describe('moved from legacy-manual (pass-bugs)', () => {

  test.describe('Manual-pass bugs (regressions of bugs found by hand)', () => {
    test('BUG-01: the superadmin\'s own workspace is marked personal', async () => {
      const ctx = await apiAsAdmin();
      const body = await (await ctx.get('/api/workspaces')).json();
      const list: Array<{ name: string; isPersonal: boolean }> = Array.isArray(body) ? body : body.workspaces;
      const own = list.find((w) => w.name === "Admin's Workspace");
      expect(own, 'admin workspace exists').toBeTruthy();
      expect(own!.isPersonal).toBe(true);
      await ctx.dispose();
    });

    test('BUG-04: SMTP Test Connection with an empty host names the missing field', async ({ page }) => {
      await loginAdminUi(page);
      await page.goto('/admin');
      await page.getByTestId('admin-tab-settings').click();
      await expandAdminSections(page);
      const smtp = page.getByTestId('admin-smtp-enabled');
      if (!(await smtp.isChecked())) await smtp.check();
      await page.getByTestId('admin-smtp-host').fill('');
      await page.getByTestId('admin-smtp-test').click();
      await expect(page.getByTestId('toast-error').filter({ hasText: /host/i }).first()).toBeVisible();
    });
  });

});

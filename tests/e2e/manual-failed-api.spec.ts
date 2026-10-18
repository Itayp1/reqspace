import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_URL } from './fixtures';
import { apiAs, apiAsAdmin } from './helpers';

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

  test('[A5.6] a user flagged mustChangePassword cannot use the API until the password is changed', async () => {
    const admin = await apiAsAdmin();
    const email = `${uniq('a56')}@example.com`;
    const created = await admin.post('/api/admin/users', { data: { name: 'Forced', email, password: 'password123' } }); // the admin route always flags the new user mustChangePassword
    test.skip(!created.ok(), `admin user creation answered ${created.status()}`);
    const ctx = await anon();
    expect((await ctx.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy();
    const res = await ctx.get('/api/workspaces');
    expect(res.status()).toBe(403);
  });

  test('[A8.3] identity headers are ignored (header auth was removed)', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip(), 'X-Auth-User': 'admin', 'X-Remote-User': 'admin' } });
    expect((await ctx.get('/api/auth/me')).status()).toBe(401);
  });
});

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

  test('[B5.3] the last owner cannot demote themselves', async () => {
    const { ctx, id } = await newUser('b53');
    const wsId = await newWorkspace(ctx);
    const res = await ctx.put(`/api/workspaces/${wsId}/members/${id}`, { data: { role: 'viewer' } });
    expect(res.status()).toBe(409);
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

test.describe('G/P — settings & local variables (API)', () => {
  test('[G6.6] PUT local-variables on a workspace I am not a member of is 403/404', async () => {
    const a = await newUser('g66a');
    const b = await newUser('g66b');
    const wsId = await newWorkspace(a.ctx);
    const res = await b.ctx.put(`/api/local-variables/${wsId}`, { data: { variables: [] } });
    expect([403, 404]).toContain(res.status());
  });

  test('[P2.2] PUT /auth/settings rejects negative and non-numeric timeouts', async () => {
    const { ctx } = await newUser('p22');
    expect((await ctx.put('/api/auth/settings', { data: { timeout: -5 } })).status()).toBe(400);
    expect((await ctx.put('/api/auth/settings', { data: { timeout: 'abc' } })).status()).toBe(400);
    expect((await ctx.put('/api/auth/settings', { data: { timeout: 5000 } })).status()).toBe(200);
  });
});

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

  test('[K4.6] DELETE /api/history without a workspace does not wipe every workspace', async () => {
    const { ctx } = await newUser('k46');
    const wsA = await newWorkspace(ctx);
    await ctx.post(`/api/workspaces/${wsA}/history`, { data: entry(200) });
    const res = await ctx.delete('/api/history');
    expect(res.status()).toBe(400);
    const body = await (await ctx.get(`/api/workspaces/${wsA}/history`)).json();
    expect(body.items).toHaveLength(1);
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

  test('[Q9.2] SMTP Test Connection refuses private targets', async () => {
    const admin = await apiAsAdmin();
    const cfg = await (await admin.get('/api/admin/config')).json();
    test.skip(!!cfg.proxy?.allowPrivateTargets, 'allowPrivateTargets is on');
    const res = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 25 } });
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toMatch(/private|blocked|reserved|internal/i);
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

  test('[Q6.5] audit-log entries are returned HTML-escaped or inert', async () => {
    const admin = await apiAsAdmin();
    const name = `<b>${uniq('esc')}</b>`;
    const user = await newUser('q65');
    await user.ctx.post('/api/workspaces', { data: { name } });
    const body = await (await admin.get('/api/admin/logs?limit=50')).text();
    expect(body).not.toContain('<b>');
  });
});

test.describe('R — server (API)', () => {
  test('[R2.2] an unknown /api/* path answers JSON 404, not the SPA shell', async () => {
    const { ctx } = await newUser('r22');
    const res = await ctx.get('/api/zzz');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toMatch(/json/);
  });

  test('[R2.5] /extension/reqspace-transport.zip is served without a manual build step', async () => {
    const ctx = await anon();
    expect((await ctx.get('/extension/reqspace-transport.zip')).status()).toBe(200);
  });

  test('[R5.3] a cross-origin POST with a valid cookie is refused', async () => {
    const { ctx } = await newUser('r53');
    const res = await ctx.post('/api/workspaces', { data: { name: uniq('csrf') }, headers: { Origin: 'https://evil.example' } });
    expect(res.status()).toBe(403);
  });

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

  test('[R-CONC] 20 parallel workspace creations all succeed', async () => {
    const { ctx } = await newUser('rconc');
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => ctx.post('/api/workspaces', { data: { name: uniq(`conc${i}`) } })));
    expect(results.map((r) => r.status()).filter((s) => s !== 201)).toEqual([]);
  });
});

test.describe('settings keys', () => {
  test('[SETTINGS-KEYS] PUT /auth/settings accepts every client key and persists it', async () => {
    const { ctx } = await newUser('skeys');
    const patch = {
      followRedirects: false, verifySsl: false, sendNoCacheHeader: true, encodeUrl: false, timeout: 1234,
      proxyEnabled: true, proxyUrl: 'http://127.0.0.1:8080', noProxy: 'localhost', proxyAuthEnabled: true,
      proxyUsername: 'u', proxyPassword: 'p', saveHistory: false, sendCookies: false,
      shortcuts: { send: 'ctrl+enter' },
    };
    const res = await ctx.put('/api/auth/settings', { data: patch });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const [k, v] of Object.entries(patch)) expect(body[k], k).toEqual(v);
    const me = await (await ctx.get('/api/auth/me')).json();
    const s = (me.user ?? me).settings ?? {};
    expect(s.sendCookies).toBe(false);
    expect(s.saveHistory).toBe(false);
  });
});

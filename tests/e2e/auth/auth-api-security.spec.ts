import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { apiAsAdmin, apiAs } from '../helpers';

// these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

test.describe('Auth API & Security Edge Cases', () => {
  test('API requests for config should 403/401 for unauthorized users', async ({ request }) => {
    // Attempt to fetch admin config without authentication
    const response = await request.get('/api/admin/config');
    expect(response.status()).toBe(401);
  });

  test('identity headers (x-user-id / x-user-email) do not authenticate', async ({ request }) => {
    const response = await request.get('/api/auth/me', {
      headers: {
        'x-user-id': 'mocked-sso-id',
        'x-user-email': 'sso@example.com'
      }
    });
    expect(response.status()).toBe(401);
  });

  test('the legacy X-Auth-User header no longer authenticates, and header mode is not a setting', async () => {
    const ctx = await pwRequest.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { 'X-Auth-User': 'header-user@example.com', 'X-Forwarded-For': '10.77.1.1' },
    });
    expect((await ctx.get('/api/auth/me')).status()).toBe(401);

    const admin = await apiAsAdmin();
    const res = await admin.put('/api/admin/config', { data: { auth: { mode: 'header', headerName: 'X-Auth-User' } } });
    expect(res.ok()).toBeTruthy();
    const cfg = await (await admin.get('/api/admin/config')).json();
    expect(cfg.auth.mode).toBeUndefined();
    expect((await ctx.get('/api/auth/me')).status()).toBe(401);
  });
});

test.describe('Auth account flows and login rate limit (API)', () => {
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

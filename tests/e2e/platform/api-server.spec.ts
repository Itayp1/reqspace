import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { apiAsAdmin } from '../helpers';

test('a NUL in an id or name is still refused', async () => {
  const admin = await apiAsAdmin();
  const res = await admin.post('/api/workspaces', { data: { name: 'bad\u0000name' } });
  expect(res.status()).toBe(400);
});

test.describe('server API behaviour', () => {
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

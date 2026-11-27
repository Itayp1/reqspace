import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';

test.describe('saving a request that was deleted', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

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
});

/**
 * Q7.7: malformed ids (NUL byte) in the path used to reach the DB layer and be
 * logged as internal 500s in Admin -> Errors. They must be rejected with a 4xx.
 * The fperrors guard in fixtures.ts additionally fails the test if any 5xx
 * group is recorded during it.
 */
test.describe('Q7.7 no internal 500s from malformed input', () => {
  test('[Q7.7] NUL-byte ids on share/fork routes return 4xx, not 500', async () => {
    const ctx = await pwRequest.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { 'X-Forwarded-For': `10.${240 + Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` },
    });
    const share = await ctx.get('/api/share/%00');
    expect(share.status()).toBeGreaterThanOrEqual(400);
    expect(share.status()).toBeLessThan(500);
    const fork = await ctx.post('/api/collections/%00/fork', { data: { targetWorkspaceId: 'x' } });
    expect(fork.status()).toBeGreaterThanOrEqual(400);
    expect(fork.status()).toBeLessThan(500);
  });
});

/**
 * Embedded NUL characters inside JSON string values (ids in the body) used to
 * reach raw SQL and surface as 500s (SQLITE_ERROR unrecognized token) on
 * POST /collections/:id/fork and PUT /requests/:id. Every case below must be a 4xx.
 */
test.describe('Q7.7 fork / request update-delete never answer 5xx', () => {
  test('[Q7.7] fork, PUT and DELETE request reject bad input with 4xx', async () => {
    test.setTimeout(120000);
    const idOf = (o: any) => (o.id ?? o._id) as string;
    const ctx = await pwRequest.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { 'X-Forwarded-For': `10.${200 + Math.floor(Math.random() * 40)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` },
    });
    const email = `q77_${Date.now()}_${Math.floor(Math.random() * 1e5)}@example.com`;
    expect((await ctx.post('/api/auth/register', { data: { name: 'Q77', email, password: 'password123' } })).status()).toBe(201);
    const personal = idOf((await (await ctx.get('/api/workspaces')).json()).find((w: any) => w.isPersonal));
    const shared = idOf(await (await ctx.post('/api/workspaces', { data: { name: `q77sh${Date.now()}` } })).json());
    const col = idOf(await (await ctx.post(`/api/workspaces/${shared}/collections`, { data: { name: 'c' } })).json());
    const pcol = idOf(await (await ctx.post(`/api/workspaces/${personal}/collections`, { data: { name: 'pc' } })).json());
    const req1 = idOf(await (await ctx.post(`/api/collections/${col}/requests`, { data: { name: 'r', method: 'GET', url: 'http://x' } })).json());

    const NUL = String.fromCharCode(0);
    const results: Array<[string, number]> = [];
    const rec = async (label: string, p: Promise<{ status(): number }>) => { results.push([label, (await p).status()]); };
    const fork = (b: any, id = col) => ctx.post(`/api/collections/${id}/fork`, { data: b });
    const put = (id: string, b: any) => ctx.put(`/api/requests/${id}`, { data: b });

    await rec('fork targetWorkspaceId NUL', fork({ targetWorkspaceId: NUL }));
    await rec('fork copyEnvironmentId NUL', fork({ targetWorkspaceId: personal, copyEnvironmentId: NUL }));
    await rec('fork name NUL', fork({ targetWorkspaceId: personal, name: `a${NUL}b` }));
    await rec('fork empty body', fork({}));
    await rec('fork wrong type', fork({ targetWorkspaceId: 5 }));
    await rec('fork unknown workspace', fork({ targetWorkspaceId: 'nope' }));
    await rec('fork unknown collection', fork({ targetWorkspaceId: personal }, 'nope'));
    await rec('fork personal source', fork({ targetWorkspaceId: personal }, pcol));
    await rec('put collectionId NUL', put(req1, { collectionId: NUL }));
    await rec('put folderId NUL', put(req1, { folderId: NUL }));
    await rec('put name NUL', put(req1, { name: `a${NUL}b` }));
    await rec('put unknown collection', put(req1, { collectionId: 'nope' }));
    await rec('put foreign-workspace collection', put(req1, { collectionId: pcol }));
    await rec('put unknown folder', put(req1, { folderId: 'nope' }));
    await rec('put unknown request', put('nope', { name: 'x' }));
    await rec('put wrong type', put(req1, { params: 'x' }));
    await rec('delete unknown request', ctx.delete('/api/requests/nope'));
    await rec('delete NUL id', ctx.delete('/api/requests/a%00b'));
    await rec('delete ok', ctx.delete(`/api/requests/${req1}`));
    await rec('delete twice', ctx.delete(`/api/requests/${req1}`));

    for (const [label, status] of results) {
      expect(status, `${label} -> ${status}`).toBeLessThan(500);
    }
    // the NUL-bearing ones must be rejected outright
    const byLabel = Object.fromEntries(results);
    for (const l of ['fork targetWorkspaceId NUL', 'fork copyEnvironmentId NUL', 'put collectionId NUL', 'put folderId NUL']) {
      expect(byLabel[l], l).toBe(400);
    }
  });
});

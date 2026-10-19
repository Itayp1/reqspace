import { test, expect } from './fixtures';
import { request as pwRequest } from '@playwright/test';
import { API_URL } from './fixtures';
import { apiAsAdmin } from './helpers';

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

  test('[Q7.7] concurrent /api/admin/users reads never answer 5xx (SQLITE_BUSY)', async () => {
    const admin = await apiAsAdmin();
    const rs = await Promise.all(Array.from({ length: 40 }, () => admin.get('/api/admin/users')));
    for (const r of rs) expect(r.status()).toBe(200);
  });
});

import { test, expect, type APIRequestContext, type Page } from '../fixtures';
import { apiAsAdmin } from '../helpers';
import { makeUser, newCtx } from './invite-helpers';

test.describe('Share links and forks (API + share page)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]|Error parsing data file/] });

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const idOf = (o: any) => (o.id ?? o._id) as string;

  async function newUser(prefix: string) {
    const u = await makeUser(prefix);
    const wsList = await (await u.ctx.get('/api/workspaces')).json();
    const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
    return { ...u, wsId: idOf(ws) };
  }

  /** Login rate limit (15/15min per IP) makes UI logins unusable here: reuse the API session cookie instead. */
  async function loginUi(page: Page, u: { ctx: APIRequestContext }) {
    await page.context().addCookies((await u.ctx.storageState()).cookies);
    // The server's CSRF check only whitelists the client origin; the browser page runs on its own port.
    await page.context().route('**/api/**', async (r) => {
      if (r.request().method() === 'GET') return r.fallback();
      // The page may close mid-flight; an unhandled rejection here fails the whole run outside any test.
      try { const res = await r.fetch({ headers: { ...r.request().headers(), origin: new URL(page.url()).origin } }); await r.fulfill({ response: res }); } catch { /* page closed */ }
    });
    await page.goto('/');
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }

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
    const text = await (await (await newCtx()).get(`/api/share/${id}`)).text();
    for (const s of ['SUPERSECRET', 'BEARERSECRET', 'HDRSECRET']) expect(text, s).not.toContain(s);
  });

  test('[M1.3] anonymous holder of a share link cannot write', async () => {
    const u = await newUser('m13');
    const { colId, reqs } = await mkCollection(u.ctx, u.wsId, 'Shared', [{ name: 'S', url: 'http://x.test' }]);
    const id = await share(u.ctx, colId);
    const a = await newCtx();
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
    const a = await newCtx();
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
    await loginUi(page, u);
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

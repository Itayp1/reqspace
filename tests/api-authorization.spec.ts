import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005';

/**
 * The permission specs verify the UI *hides* actions a role may not perform —
 * but a UI test never sends the forbidden request, so a route that wrongly
 * accepts it is invisible to them (TESTING.md Rule 2). These call the API
 * directly with a lower-privileged cookie and assert 403 (CR#7, CR#12).
 */

async function register(request: APIRequestContext, label: string) {
  const suffix = `${label}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `${suffix}@test.com`;
  const res = await request.post(`${BASE}/api/auth/register`, {
    data: { name: `AZ ${suffix}`, email, password: 'password123' },
  });
  expect(res.ok(), 'register failed — is self-registration enabled (global-setup)?').toBeTruthy();
  const cookie = res.headers()['set-cookie']?.split(';')[0] || '';
  const wsRes = await request.get(`${BASE}/api/workspaces`, { headers: { cookie } });
  const workspaces = await wsRes.json();
  return { cookie, email, workspaceId: workspaces[0]?._id as string };
}

test.describe('API authorization (reachable only by bypassing the UI)', () => {
  test('a viewer cannot mutate collections via the API', async ({ request }) => {
    const owner = await register(request, 'own');
    const viewer = await register(request, 'view');

    // Owner creates a collection and invites the viewer as 'viewer'.
    const colRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'AuthZ Collection' },
    });
    expect(colRes.ok()).toBeTruthy();
    const col = await colRes.json();

    const inviteRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/members`, {
      headers: { cookie: owner.cookie },
      data: { email: viewer.email, role: 'viewer' },
    });
    expect(inviteRes.ok()).toBeTruthy();

    // Viewer can read...
    const readRes = await request.get(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: viewer.cookie },
    });
    expect(readRes.status()).toBe(200);

    // ...but cannot update or delete via the API.
    const putRes = await request.put(`${BASE}/api/collections/${col._id}`, {
      headers: { cookie: viewer.cookie },
      data: { name: 'hacked' },
    });
    expect(putRes.status()).toBe(403);

    const delRes = await request.delete(`${BASE}/api/collections/${col._id}`, {
      headers: { cookie: viewer.cookie },
    });
    expect(delRes.status()).toBe(403);
  });

  test('logout clears the auth cookie', async ({ request }) => {
    const user = await register(request, 'bye');
    const res = await request.post(`${BASE}/api/auth/logout`, { headers: { cookie: user.cookie } });
    expect(res.ok()).toBeTruthy();
    const setCookie = res.headers()['set-cookie'] || '';
    expect(setCookie.toLowerCase()).toContain('token=');
    expect(setCookie.toLowerCase()).toMatch(/expires=|max-age=0/);
  });

  test('wsdl import without workspace membership is forbidden', async ({ request }) => {
    const owner = await register(request, 'wsdl');
    const outsider = await register(request, 'wsdlo');
    const res = await request.post(`${BASE}/api/import/wsdl`, {
      headers: { cookie: outsider.cookie },
      data: { url: 'https://example.com/service?wsdl', workspaceId: owner.workspaceId },
    });
    expect(res.status()).toBe(403);
  });

  test('a non-member cannot import a workspace dump', async ({ request }) => {
    const owner = await register(request, 'imp');
    const outsider = await register(request, 'impo');
    const res = await request.post(`${BASE}/api/admin/import/${owner.workspaceId}`, {
      headers: { cookie: outsider.cookie },
      data: { collections: [] },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('a non-member cannot read another workspace\'s collections', async ({ request }) => {
    const owner = await register(request, 'own2');
    const outsider = await register(request, 'out');

    const res = await request.get(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: outsider.cookie },
    });
    expect(res.status()).toBe(403);
  });
});

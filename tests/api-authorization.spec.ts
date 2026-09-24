import { serverOrigin } from './helpers/baseUrl';
import { test, expect, APIRequestContext } from '@playwright/test';


/**
 * The permission specs verify the UI *hides* actions a role may not perform —
 * but a UI test never sends the forbidden request, so a route that wrongly
 * accepts it is invisible to them (TESTING.md Rule 2). These call the API
 * directly with a lower-privileged cookie and assert 403 (CR#7, CR#12).
 */

async function register(request: APIRequestContext, label: string) {
  const suffix = `${label}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `${suffix}@test.com`;
  const res = await request.post(`${serverOrigin()}/api/auth/register`, {
    data: { name: `AZ ${suffix}`, email, password: 'password123' },
  });
  expect(res.ok(), 'register failed — is self-registration enabled (global-setup)?').toBeTruthy();
  const cookie = res.headers()['set-cookie']?.split(';')[0] || '';
  const wsRes = await request.get(`${serverOrigin()}/api/workspaces`, { headers: { cookie } });
  const workspaces = await wsRes.json();
  return { cookie, email, workspaceId: workspaces[0]?._id as string };
}

test.describe('API authorization (reachable only by bypassing the UI)', () => {
  test('a viewer cannot mutate collections via the API', async ({ request }) => {
    const owner = await register(request, 'own');
    const viewer = await register(request, 'view');

    // Owner creates a collection and invites the viewer as 'viewer'.
    const colRes = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'AuthZ Collection' },
    });
    expect(colRes.ok()).toBeTruthy();
    const col = await colRes.json();

    const inviteRes = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/members`, {
      headers: { cookie: owner.cookie },
      data: { email: viewer.email, role: 'viewer' },
    });
    expect(inviteRes.ok()).toBeTruthy();

    // Viewer can read...
    const readRes = await request.get(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: viewer.cookie },
    });
    expect(readRes.status()).toBe(200);

    // ...but cannot update or delete via the API.
    const putRes = await request.put(`${serverOrigin()}/api/collections/${col._id}`, {
      headers: { cookie: viewer.cookie },
      data: { name: 'hacked' },
    });
    expect(putRes.status()).toBe(403);

    const delRes = await request.delete(`${serverOrigin()}/api/collections/${col._id}`, {
      headers: { cookie: viewer.cookie },
    });
    expect(delRes.status()).toBe(403);
  });

  test('a non-member cannot read another workspace\'s collections', async ({ request }) => {
    const owner = await register(request, 'own2');
    const outsider = await register(request, 'out');

    const res = await request.get(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: outsider.cookie },
    });
    expect(res.status()).toBe(403);
  });

  test('a non-admin cannot import a workspace dump', async ({ request }) => {
    const user = await register(request, 'imp');
    const res = await request.post(`${serverOrigin()}/api/admin/import/${user.workspaceId}`, {
      headers: { cookie: user.cookie },
      data: { collections: [{ name: 'smuggled' }] },
    });
    expect(res.status()).toBe(403);
  });

  test('a viewer cannot import a WSDL into the workspace', async ({ request }) => {
    const owner = await register(request, 'wsdlown');
    const viewer = await register(request, 'wsdlview');
    const inviteRes = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/members`, {
      headers: { cookie: owner.cookie },
      data: { email: viewer.email, role: 'viewer' },
    });
    expect(inviteRes.ok()).toBeTruthy();

    const res = await request.post(`${serverOrigin()}/api/import/wsdl`, {
      headers: { cookie: viewer.cookie },
      data: { url: 'https://example.com/service?wsdl', workspaceId: owner.workspaceId },
    });
    expect(res.status()).toBe(403);
  });

  test('logout clears the session cookie', async ({ request }) => {
    const user = await register(request, 'bye');
    const me = await request.get(`${serverOrigin()}/api/auth/me`, { headers: { cookie: user.cookie } });
    expect(me.status()).toBe(200);

    const out = await request.post(`${serverOrigin()}/api/auth/logout`, { headers: { cookie: user.cookie } });
    expect(out.ok()).toBeTruthy();
    const cleared = out.headers()['set-cookie'] || '';
    expect(cleared).toMatch(/token=/);
    expect(cleared.toLowerCase()).toMatch(/expires=|max-age=0/);
  });
});

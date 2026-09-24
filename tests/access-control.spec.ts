import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005';

/**
 * Regression coverage for a set of broken-access-control (IDOR) bugs found in a
 * security review: several read endpoints checked only `authenticate` (any
 * logged-in user) and never verified the caller was actually a member of the
 * workspace the requested collection/folder/request/environment belonged to.
 * A second, unrelated bug let any authenticated user publish a public share
 * link for *any* collection in the system, and the capture endpoint had no
 * auth requirement at all. Every case below failed (leaked or accepted data
 * it shouldn't have) before the fix in this same change; they must keep
 * failing closed going forward.
 */

async function registerUser(request: APIRequestContext, label: string) {
  const suffix = `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const res = await request.post(`${BASE}/api/auth/register`, {
    data: { name: `AC ${suffix}`, email: `ac${suffix}@test.com`, password: 'password123' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const cookie = res.headers()['set-cookie']?.split(';')[0] || '';
  const workspacesRes = await request.get(`${BASE}/api/workspaces`, { headers: { cookie } });
  const workspaceId = (await workspacesRes.json())[0]._id as string;
  return { cookie, workspaceId };
}

test.describe('Cross-workspace access control (IDOR regressions)', () => {
  test('a non-member cannot read another workspace\'s collection folders/requests, or write into it', async ({ request }) => {
    const owner = await registerUser(request, 'own');
    const outsider = await registerUser(request, 'out');

    const collRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Private Collection' },
    });
    expect(collRes.ok()).toBeTruthy();
    const collection = await collRes.json();

    const reqRes = await request.post(`${BASE}/api/collections/${collection._id}/requests`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Secret Request', method: 'GET', url: 'https://example.com/secret' },
    });
    expect(reqRes.ok()).toBeTruthy();
    const secretRequest = await reqRes.json();

    // Outsider must not be able to list folders/requests in the owner's collection.
    const listFolders = await request.get(`${BASE}/api/collections/${collection._id}/folders`, {
      headers: { cookie: outsider.cookie },
    });
    expect(listFolders.status()).toBe(403);

    const listRequests = await request.get(`${BASE}/api/collections/${collection._id}/requests`, {
      headers: { cookie: outsider.cookie },
    });
    expect(listRequests.status()).toBe(403);

    // Nor read a specific request by id directly.
    const getRequest = await request.get(`${BASE}/api/requests/${secretRequest._id}`, {
      headers: { cookie: outsider.cookie },
    });
    expect(getRequest.status()).toBe(403);

    // Nor create a folder or request inside the owner's collection.
    const createFolder = await request.post(`${BASE}/api/collections/${collection._id}/folders`, {
      headers: { cookie: outsider.cookie },
      data: { name: 'Injected Folder' },
    });
    expect(createFolder.status()).toBe(403);

    const createRequest = await request.post(`${BASE}/api/collections/${collection._id}/requests`, {
      headers: { cookie: outsider.cookie },
      data: { name: 'Injected Request', method: 'GET', url: 'https://example.com' },
    });
    expect(createRequest.status()).toBe(403);

    // Sanity: the owner themself still can.
    const ownerRead = await request.get(`${BASE}/api/requests/${secretRequest._id}`, {
      headers: { cookie: owner.cookie },
    });
    expect(ownerRead.ok()).toBeTruthy();
  });

  test('a non-member cannot read another workspace\'s environment by id', async ({ request }) => {
    const owner = await registerUser(request, 'envown');
    const outsider = await registerUser(request, 'envout');

    const envRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/environments`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Prod Secrets', variables: [{ key: 'API_KEY', value: 'super-secret', enabled: true }] },
    });
    expect(envRes.ok()).toBeTruthy();
    const env = await envRes.json();

    const outsiderRead = await request.get(`${BASE}/api/environments/${env._id}`, {
      headers: { cookie: outsider.cookie },
    });
    expect(outsiderRead.status()).toBe(403);

    const ownerRead = await request.get(`${BASE}/api/environments/${env._id}`, {
      headers: { cookie: owner.cookie },
    });
    expect(ownerRead.ok()).toBeTruthy();
  });

  test('a non-member cannot publish a public share link for another workspace\'s collection', async ({ request }) => {
    const owner = await registerUser(request, 'shown');
    const outsider = await registerUser(request, 'shout');

    const collRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Not Yours To Share' },
    });
    expect(collRes.ok()).toBeTruthy();
    const collection = await collRes.json();

    const shareAttempt = await request.post(`${BASE}/api/share/collection/${collection._id}`, {
      headers: { cookie: outsider.cookie },
    });
    expect(shareAttempt.status()).toBe(403);

    // Sanity: the owner (editor+) can.
    const ownerShare = await request.post(`${BASE}/api/share/collection/${collection._id}`, {
      headers: { cookie: owner.cookie },
    });
    expect(ownerShare.ok()).toBeTruthy();
  });

  test('the capture endpoint rejects unauthenticated requests instead of writing into an arbitrary workspace', async ({ request }) => {
    const owner = await registerUser(request, 'capown');

    const before = await request.get(`${BASE}/api/collections/${owner.workspaceId}/folders`, {
      headers: { cookie: owner.cookie },
    }).catch(() => null);
    void before; // not needed — just documents that the workspace exists before the attempt

    const anonCapture = await request.post(`${BASE}/api/capture/${owner.workspaceId}/anything`, {
      data: { hello: 'world' },
    });
    expect(anonCapture.status()).toBe(401);
  });

  test('an authenticated non-member of the workspace cannot use the capture endpoint either', async ({ request }) => {
    const owner = await registerUser(request, 'capown2');
    const outsider = await registerUser(request, 'capout');

    const captureAttempt = await request.post(`${BASE}/api/capture/${owner.workspaceId}/anything`, {
      headers: { cookie: outsider.cookie },
      data: { hello: 'world' },
    });
    expect(captureAttempt.status()).toBe(403);
  });
});

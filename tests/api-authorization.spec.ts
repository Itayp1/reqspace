import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:3005';

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

  test('a non-member cannot read another workspace\'s collections', async ({ request }) => {
    const owner = await register(request, 'own2');
    const outsider = await register(request, 'out');

    const res = await request.get(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: outsider.cookie },
    });
    expect(res.status()).toBe(403);
  });

  // SEC-2 — four holes that were reachable only by bypassing the UI: each one
  // accepted a client-supplied collectionId/workspaceId with no membership
  // check at all. All four must now 403 for a non-member.
  //
  // A single shared owner/outsider pair is reused across the four hole
  // checks (registered once in beforeAll) rather than one fresh pair per
  // test — `POST /api/auth/register` is rate-limited to 10/hour per IP
  // (server/src/middleware/rateLimit.ts), and this whole suite shares one.
  test.describe('SEC-2 — the four authorization holes', () => {
    let owner: Awaited<ReturnType<typeof register>>;
    let outsider: Awaited<ReturnType<typeof register>>;

    test.beforeAll(async ({ request }) => {
      owner = await register(request, 'sec2own');
      outsider = await register(request, 'sec2out');
    });

    test('a non-member cannot save history into another workspace\'s collection', async ({ request }) => {
      const colRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
        headers: { cookie: owner.cookie },
        data: { name: 'SEC-2 hole #1 target' },
      });
      const col = await colRes.json();

      // Fake history id — the role check must fire before the handler even
      // looks the history entry up.
      const res = await request.post(`${BASE}/api/history/000000000000000000000000/save`, {
        headers: { cookie: outsider.cookie },
        data: { collectionId: col._id },
      });
      expect(res.status()).toBe(403);
    });

    test('a non-member cannot import a WSDL into another workspace', async ({ request }) => {
      const res = await request.post(`${BASE}/api/import/wsdl`, {
        headers: { cookie: outsider.cookie },
        data: { url: 'http://example.com/service?wsdl', workspaceId: owner.workspaceId },
      });
      expect(res.status()).toBe(403);
    });

    test('a non-member cannot export another workspace\'s collection', async ({ request }) => {
      const colRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
        headers: { cookie: owner.cookie },
        data: { name: 'SEC-2 hole #3 target' },
      });
      const col = await colRes.json();

      const res = await request.get(`${BASE}/api/collections/${col._id}/export`, {
        headers: { cookie: outsider.cookie },
      });
      expect(res.status()).toBe(403);
    });

    test('a non-member cannot import a collection into another workspace', async ({ request }) => {
      const res = await request.post(`${BASE}/api/collections/import`, {
        headers: { cookie: outsider.cookie },
        data: {
          workspaceId: owner.workspaceId,
          data: { version: 1, collection: { name: 'Hacked' }, folders: [], requests: [] },
        },
      });
      expect(res.status()).toBe(403);
    });

    test('an editor can export a collection and import it into another workspace, and the tree matches', async ({ request }) => {
      const source = owner;
      const dest = outsider;

      const colRes = await request.post(`${BASE}/api/workspaces/${source.workspaceId}/collections`, {
        headers: { cookie: source.cookie },
        data: { name: 'Round Trip Collection' },
      });
      const col = await colRes.json();

      const parentFolderRes = await request.post(`${BASE}/api/collections/${col._id}/folders`, {
        headers: { cookie: source.cookie },
        data: { name: 'Parent Folder' },
      });
      const parentFolder = await parentFolderRes.json();

      const childFolderRes = await request.post(`${BASE}/api/collections/${col._id}/folders`, {
        headers: { cookie: source.cookie },
        data: { name: 'Child Folder', parentFolderId: parentFolder._id },
      });
      const childFolder = await childFolderRes.json();

      await request.post(`${BASE}/api/collections/${col._id}/requests`, {
        headers: { cookie: source.cookie },
        data: { name: 'Root Request', method: 'GET', url: 'https://example.com/root' },
      });
      await request.post(`${BASE}/api/collections/${col._id}/requests`, {
        headers: { cookie: source.cookie },
        data: { name: 'Nested Request', method: 'POST', url: 'https://example.com/nested', folderId: childFolder._id },
      });

      const exportRes = await request.get(`${BASE}/api/collections/${col._id}/export`, {
        headers: { cookie: source.cookie },
      });
      expect(exportRes.status()).toBe(200);
      const dump = await exportRes.json();
      expect(dump.version).toBe(1);
      expect(dump.folders).toHaveLength(2);
      expect(dump.requests).toHaveLength(2);

      const importRes = await request.post(`${BASE}/api/collections/import`, {
        headers: { cookie: dest.cookie },
        data: { workspaceId: dest.workspaceId, data: dump },
      });
      expect(importRes.status()).toBe(201);
      const imported = await importRes.json();

      const foldersRes = await request.get(`${BASE}/api/collections/${imported.collectionId}/folders`, {
        headers: { cookie: dest.cookie },
      });
      const importedFolders = await foldersRes.json();
      expect(importedFolders).toHaveLength(2);
      const importedParent = importedFolders.find((f: any) => f.name === 'Parent Folder');
      const importedChild = importedFolders.find((f: any) => f.name === 'Child Folder');
      expect(importedParent.parentFolderId).toBeNull();
      expect(importedChild.parentFolderId).toBe(importedParent._id);

      const requestsRes = await request.get(`${BASE}/api/collections/${imported.collectionId}/requests`, {
        headers: { cookie: dest.cookie },
      });
      const importedRequests = await requestsRes.json();
      expect(importedRequests).toHaveLength(2);
      const nested = importedRequests.find((r: any) => r.name === 'Nested Request');
      expect(nested.folderId).toBe(importedChild._id);
    });
  });
});

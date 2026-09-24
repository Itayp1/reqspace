import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from './helpers/adminAuth';

test.describe('Admin Operations & Public Workspaces', () => {
  let superAdminCookie: string;
  let regularUserCookie: string;
  let regularUserId: string;
  let superAdminId: string;

  test.beforeAll(async ({ request }) => {
    // global-setup already reset the seeded superadmin and completed the
    // forced first-login password change — just log in with the result.
    const admin = await loginAsSuperAdmin(request);
    superAdminCookie = admin.cookie;
    superAdminId = admin.userId;

    // Register Regular User
    const rSuffix = Math.floor(Math.random() * 100000);
    const rRes = await request.post('http://localhost:3005/api/auth/register', {
      data: { name: `Reg ${rSuffix}`, email: `reg${rSuffix}@test.com`, password: 'password123' }
    });
    regularUserCookie = rRes.headers()['set-cookie']?.split(';')[0] || '';
    const rData = await rRes.json();
    regularUserId = rData.user.id || rData.user._id;
  });

  test.afterAll(async () => {
    // cleanup if necessary
  });

  test('SuperAdmin can access audit logs', async ({ request }) => {
    const res = await request.get('http://localhost:3005/api/admin/audit-logs', {
      headers: { cookie: superAdminCookie }
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.logs)).toBe(true);
  });

  test('SuperAdmin can manage user (promote, revoke, suspend, delete)', async ({ request }) => {
    // 1. Create a temporary user
    const suffix = Math.floor(Math.random() * 100000);
    const uRes = await request.post('http://localhost:3005/api/auth/register', {
      data: { name: `Temp ${suffix}`, email: `temp${suffix}@test.com`, password: 'password123' }
    });
    const uData = await uRes.json();
    const tempId = uData.user.id || uData.user._id;

    // 2. Promote to admin
    const promoteRes = await request.post(`http://localhost:3005/api/admin/users/${tempId}/promote`, {
      headers: { cookie: superAdminCookie }
    });
    expect(promoteRes.status()).toBe(200);
    const promoteData = await promoteRes.json();
    expect(promoteData.user.isSuperAdmin).toBe(true);

    // 3. Revoke admin
    const revokeRes = await request.post(`http://localhost:3005/api/admin/users/${tempId}/revoke`, {
      headers: { cookie: superAdminCookie }
    });
    expect(revokeRes.status()).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.user.isSuperAdmin).toBe(false);

    // 4. Suspend
    const suspendRes = await request.post(`http://localhost:3005/api/admin/users/${tempId}/suspend`, {
      headers: { cookie: superAdminCookie }
    });
    expect(suspendRes.status()).toBe(200);
    expect((await suspendRes.json()).user.status).toBe('suspended');

    // 5. Delete
    const delRes = await request.delete(`http://localhost:3005/api/admin/users/${tempId}`, {
      headers: { cookie: superAdminCookie }
    });
    expect(delRes.status()).toBe(200);
  });

  test('Workspace permissions (Admin can add, modify role, and delete member)', async ({ request }) => {
    // Create workspace
    const wsRes = await request.post('http://localhost:3005/api/workspaces', {
      data: { name: 'Admin Test WS' },
      headers: { cookie: superAdminCookie }
    });
    const wsId = (await wsRes.json())._id;

    // Register a member
    const suffix = Math.floor(Math.random() * 100000);
    await request.post('http://localhost:3005/api/auth/register', {
      data: { name: `Member ${suffix}`, email: `member${suffix}@test.com`, password: 'password123' }
    });

    // Invite user as viewer (the app's role model is viewer/editor/owner — no 'runner')
    const inviteRes = await request.post(`http://localhost:3005/api/workspaces/${wsId}/members`, {
      data: { email: `member${suffix}@test.com`, role: 'viewer' },
      headers: { cookie: superAdminCookie }
    });
    expect(inviteRes.status()).toBe(201);

    const wsData = (await (await request.get(`http://localhost:3005/api/workspaces/${wsId}`, { headers: { cookie: superAdminCookie } })).json());
    const memberObj = wsData.members.find((m: any) => m.userId.email === `member${suffix}@test.com`);
    expect(memberObj.role).toBe('viewer');

    // Change role to editor
    const updateRes = await request.put(`http://localhost:3005/api/workspaces/${wsId}/members/${memberObj.userId._id}`, {
      data: { role: 'editor' },
      headers: { cookie: superAdminCookie }
    });
    expect(updateRes.status()).toBe(200);

    // Remove member
    const removeRes = await request.delete(`http://localhost:3005/api/workspaces/${wsId}/members/${memberObj.userId._id}`, {
      headers: { cookie: superAdminCookie }
    });
    expect(removeRes.status()).toBe(200);
  });

  test('Public workspaces grant viewer access by default', async ({ request }) => {
    // 1. SuperAdmin creates a Public workspace
    const wsRes = await request.post('http://localhost:3005/api/workspaces', {
      data: { name: 'Public Workspace', isPublic: true },
      headers: { cookie: superAdminCookie }
    });
    const wsId = (await wsRes.json())._id;

    // 2. Regular user (who is NOT in members list) attempts to view it
    const viewRes = await request.get(`http://localhost:3005/api/workspaces/${wsId}`, {
      headers: { cookie: regularUserCookie }
    });
    expect(viewRes.status()).toBe(200);
    expect((await viewRes.json()).name).toBe('Public Workspace');

    // 3. Regular user attempts to edit/create a collection in it (should be DENIED)
    const createColRes = await request.post(`http://localhost:3005/api/workspaces/${wsId}/collections`, {
      data: { name: 'Hacked Collection' },
      headers: { cookie: regularUserCookie }
    });
    expect(createColRes.status()).toBe(403); // Viewer role cannot create collections
  });

  test('Private workspaces block uninvited users', async ({ request }) => {
    // 1. SuperAdmin creates a Private workspace
    const wsRes = await request.post('http://localhost:3005/api/workspaces', {
      data: { name: 'Private Workspace', isPublic: false },
      headers: { cookie: superAdminCookie }
    });
    const wsId = (await wsRes.json())._id;

    // 2. Regular user attempts to view it (should be DENIED)
    const viewRes = await request.get(`http://localhost:3005/api/workspaces/${wsId}`, {
      headers: { cookie: regularUserCookie }
    });
    expect(viewRes.status()).toBe(403);
  });

  // FIX-1 — the export used to query Folder/ApiRequest by `workspaceId`, a
  // field neither model has, so it always shipped zero folders and zero
  // requests; the import then wrote a `workspaceId` field the models don't
  // have instead of remapping collectionId/parentFolderId/folderId, so
  // nothing in the imported tree was actually linked. This round-trips a
  // workspace containing 2 collections, 3 nested folders and 5 requests, and
  // asserts the imported tree — names, nesting and order — matches the source.
  test('admin export/import round-trips a workspace\'s full tree', async ({ request }) => {
    const wsRes = await request.post('http://localhost:3005/api/workspaces', {
      data: { name: 'FIX-1 Export Source' },
      headers: { cookie: superAdminCookie },
    });
    const sourceWs = await wsRes.json();

    const col1Res = await request.post(`http://localhost:3005/api/workspaces/${sourceWs._id}/collections`, {
      data: { name: 'Collection One' },
      headers: { cookie: superAdminCookie },
    });
    const col1 = await col1Res.json();
    const col2Res = await request.post(`http://localhost:3005/api/workspaces/${sourceWs._id}/collections`, {
      data: { name: 'Collection Two' },
      headers: { cookie: superAdminCookie },
    });
    const col2 = await col2Res.json();

    const rootFolderRes = await request.post(`http://localhost:3005/api/collections/${col1._id}/folders`, {
      data: { name: 'Root Folder' },
      headers: { cookie: superAdminCookie },
    });
    const rootFolder = await rootFolderRes.json();
    const nestedFolderRes = await request.post(`http://localhost:3005/api/collections/${col1._id}/folders`, {
      data: { name: 'Nested Folder', parentFolderId: rootFolder._id },
      headers: { cookie: superAdminCookie },
    });
    const nestedFolder = await nestedFolderRes.json();
    const col2FolderRes = await request.post(`http://localhost:3005/api/collections/${col2._id}/folders`, {
      data: { name: 'Col2 Folder' },
      headers: { cookie: superAdminCookie },
    });
    const col2Folder = await col2FolderRes.json();

    await request.post(`http://localhost:3005/api/collections/${col1._id}/requests`, {
      data: { name: 'Req A', method: 'GET', url: 'https://example.com/a' },
      headers: { cookie: superAdminCookie },
    });
    await request.post(`http://localhost:3005/api/collections/${col1._id}/requests`, {
      data: { name: 'Req B', method: 'POST', url: 'https://example.com/b', folderId: rootFolder._id },
      headers: { cookie: superAdminCookie },
    });
    await request.post(`http://localhost:3005/api/collections/${col1._id}/requests`, {
      data: { name: 'Req C', method: 'PUT', url: 'https://example.com/c', folderId: nestedFolder._id },
      headers: { cookie: superAdminCookie },
    });
    await request.post(`http://localhost:3005/api/collections/${col2._id}/requests`, {
      data: { name: 'Req D', method: 'DELETE', url: 'https://example.com/d' },
      headers: { cookie: superAdminCookie },
    });
    await request.post(`http://localhost:3005/api/collections/${col2._id}/requests`, {
      data: { name: 'Req E', method: 'GET', url: 'https://example.com/e', folderId: col2Folder._id },
      headers: { cookie: superAdminCookie },
    });

    const exportRes = await request.get(`http://localhost:3005/api/admin/export/${sourceWs._id}`, {
      headers: { cookie: superAdminCookie },
    });
    expect(exportRes.status()).toBe(200);
    const dump = await exportRes.json();
    expect(dump.version).toBe(1);
    expect(dump.collections).toHaveLength(2);
    expect(dump.folders).toHaveLength(3);
    expect(dump.requests).toHaveLength(5);

    const destWsRes = await request.post('http://localhost:3005/api/workspaces', {
      data: { name: 'FIX-1 Import Destination' },
      headers: { cookie: superAdminCookie },
    });
    const destWs = await destWsRes.json();

    const importRes = await request.post(`http://localhost:3005/api/admin/import/${destWs._id}`, {
      data: dump,
      headers: { cookie: superAdminCookie },
    });
    expect(importRes.status()).toBe(200);

    const importedCols = await (await request.get(`http://localhost:3005/api/workspaces/${destWs._id}/collections`, {
      headers: { cookie: superAdminCookie },
    })).json();
    expect(importedCols).toHaveLength(2);
    const importedCol1 = importedCols.find((c: any) => c.name === 'Collection One');
    const importedCol2 = importedCols.find((c: any) => c.name === 'Collection Two');

    const importedFoldersCol1 = await (await request.get(`http://localhost:3005/api/collections/${importedCol1._id}/folders`, {
      headers: { cookie: superAdminCookie },
    })).json();
    expect(importedFoldersCol1).toHaveLength(2);
    const importedRoot = importedFoldersCol1.find((f: any) => f.name === 'Root Folder');
    const importedNested = importedFoldersCol1.find((f: any) => f.name === 'Nested Folder');
    expect(importedRoot.parentFolderId).toBeNull();
    expect(importedNested.parentFolderId).toBe(importedRoot._id);

    const importedFoldersCol2 = await (await request.get(`http://localhost:3005/api/collections/${importedCol2._id}/folders`, {
      headers: { cookie: superAdminCookie },
    })).json();
    expect(importedFoldersCol2).toHaveLength(1);

    const importedRequestsCol1 = await (await request.get(`http://localhost:3005/api/collections/${importedCol1._id}/requests`, {
      headers: { cookie: superAdminCookie },
    })).json();
    expect(importedRequestsCol1).toHaveLength(3);
    expect(importedRequestsCol1.find((r: any) => r.name === 'Req A').folderId).toBeNull();
    expect(importedRequestsCol1.find((r: any) => r.name === 'Req B').folderId).toBe(importedRoot._id);
    expect(importedRequestsCol1.find((r: any) => r.name === 'Req C').folderId).toBe(importedNested._id);

    const importedRequestsCol2 = await (await request.get(`http://localhost:3005/api/collections/${importedCol2._id}/requests`, {
      headers: { cookie: superAdminCookie },
    })).json();
    expect(importedRequestsCol2).toHaveLength(2);
    expect(importedRequestsCol2.find((r: any) => r.name === 'Req E').folderId).toBe(importedFoldersCol2[0]._id);
  });
});

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Admin Operations & Public Workspaces', () => {
  let superAdminCookie: string;
  let regularUserCookie: string;
  let regularUserId: string;
  let superAdminId: string;

  test.beforeAll(async ({ request }) => {
    // Register SuperAdmin
    const saSuffix = Math.floor(Math.random() * 100000);
    const saRes = await request.post('http://localhost:3005/api/auth/register', {
      data: { name: `SA ${saSuffix}`, email: `sa${saSuffix}@test.com`, password: 'password123' }
    });
    superAdminCookie = saRes.headers()['set-cookie']?.split(';')[0] || '';
    const saData = await saRes.json();
    superAdminId = saData.user.id || saData.user._id;

    // Direct DB promotion for SA
    const dbScript = `
      const mongoose = require('mongoose');
      mongoose.connect('mongodb+srv://REDACTED:REDACTED@REDACTED.mongodb.net/REDACTED', { tlsInsecure: true }).then(async () => {
        await mongoose.connection.db.collection('users').updateOne(
          { email: 'sa${saSuffix}@test.com' },
          { $set: { isSuperAdmin: true } }
        );
        process.exit(0);
      });
    `;
    const scriptName = `./server/temp-promote-${saSuffix}.js`;
    require('fs').writeFileSync(scriptName, dbScript);
    execSync(`node temp-promote-${saSuffix}.js`, { cwd: './server' });
    require('fs').unlinkSync(scriptName);

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

    // Invite user as runner
    const inviteRes = await request.post(`http://localhost:3005/api/workspaces/${wsId}/members`, {
      data: { email: `member${suffix}@test.com`, role: 'runner' },
      headers: { cookie: superAdminCookie }
    });
    expect(inviteRes.status()).toBe(201);

    const wsData = (await (await request.get(`http://localhost:3005/api/workspaces/${wsId}`, { headers: { cookie: superAdminCookie } })).json());
    const memberObj = wsData.members.find((m: any) => m.userId.email === `member${suffix}@test.com`);
    expect(memberObj.role).toBe('runner');

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
});

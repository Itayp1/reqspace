import { test, expect, APIRequestContext } from '@playwright/test';
import { io as ioClient } from '../client/node_modules/socket.io-client';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005';

/**
 * Regression coverage for CR#9: collection/folder/request `:updated` and
 * `:deleted` broadcasts were silent no-ops because `resolvedWorkspaceId` was
 * never assigned. The old socket specs only ever asserted `:created` (whose
 * workspaceId comes from the URL path and so never hit the bug).
 *
 * These use a second connected client as the observer — a single-client test
 * cannot detect a dead broadcast, and would have passed against the broken code.
 * Written to fail against pre-fix `master`.
 */

async function registerAndGetWorkspace(request: APIRequestContext, label: string) {
  const suffix = `${label}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await request.post(`${BASE}/api/auth/register`, {
    data: { name: `RT ${suffix}`, email: `rt${suffix}@test.com`, password: 'password123' },
  });
  expect(res.ok(), 'register failed — is self-registration enabled (global-setup)?').toBeTruthy();
  const cookie = res.headers()['set-cookie']?.split(';')[0] || '';
  const wsRes = await request.get(`${BASE}/api/workspaces`, { headers: { cookie } });
  const workspaces = await wsRes.json();
  return { cookie, workspaceId: workspaces[0]._id as string };
}

function connectSocket(cookie: string) {
  return ioClient(BASE, { path: '/ws', extraHeaders: { cookie }, forceNew: true });
}

function once(socket: any, event: string) {
  return new Promise<void>((resolve) => socket.once('connect', () => resolve()));
}

test.describe('Realtime broadcasts reach a second client (CR#9)', () => {
  test('collection:updated and collection:deleted are delivered to an observer', async ({ request }) => {
    test.setTimeout(30000);
    const owner = await registerAndGetWorkspace(request, 'own');

    // Two sockets in the room: the actor (A) and the observer (B). Both must be
    // present or the room has one socket and the broadcast has no peer.
    const a = connectSocket(owner.cookie);
    const b = connectSocket(owner.cookie);
    await Promise.all([once(a, 'connect'), once(b, 'connect')]);
    a.emit('join:workspace', owner.workspaceId);
    b.emit('join:workspace', owner.workspaceId);
    await new Promise((r) => setTimeout(r, 400));

    const updated: any[] = [];
    const deleted: any[] = [];
    b.on('collection:updated', (c: any) => updated.push(c));
    b.on('collection:deleted', (id: any) => deleted.push(id));

    const created = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Collection' },
    });
    const col = await created.json();

    await request.put(`${BASE}/api/collections/${col._id}`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Collection Renamed' },
    });
    await expect.poll(() => updated.length, { timeout: 3000 }).toBeGreaterThan(0);
    expect(updated[0].name).toBe('RT Collection Renamed');

    await request.delete(`${BASE}/api/collections/${col._id}`, { headers: { cookie: owner.cookie } });
    await expect.poll(() => deleted.length, { timeout: 3000 }).toBeGreaterThan(0);
    expect(String(deleted[0])).toBe(String(col._id));

    a.close();
    b.close();
  });

  test('folder, request, and environment updates reach an observer', async ({ request }) => {
    test.setTimeout(30000);
    const owner = await registerAndGetWorkspace(request, 'tree');
    const a = connectSocket(owner.cookie);
    const b = connectSocket(owner.cookie);
    await Promise.all([once(a, 'connect'), once(b, 'connect')]);
    a.emit('join:workspace', owner.workspaceId);
    b.emit('join:workspace', owner.workspaceId);
    await new Promise((r) => setTimeout(r, 400));

    const events: string[] = [];
    for (const name of ['folder:updated', 'request:updated', 'environment:updated', 'workspace:reordered']) {
      b.on(name, () => events.push(name));
    }

    const colRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Tree' },
    });
    const col = await colRes.json();
    const folderRes = await request.post(`${BASE}/api/collections/${col._id}/folders`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Folder' },
    });
    const folder = await folderRes.json();
    await request.put(`${BASE}/api/folders/${folder._id}`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Folder Renamed' },
    });
    const reqRes = await request.post(`${BASE}/api/collections/${col._id}/requests`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Req', method: 'GET', url: 'https://example.com' },
    });
    const saved = await reqRes.json();
    await request.put(`${BASE}/api/requests/${saved._id}`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Req Renamed' },
    });
    const envRes = await request.post(`${BASE}/api/workspaces/${owner.workspaceId}/environments`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Staging' },
    });
    const env = await envRes.json();
    await request.put(`${BASE}/api/environments/${env._id}`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Staging Renamed' },
    });
    await request.put(`${BASE}/api/reorder`, {
      headers: { cookie: owner.cookie },
      data: { items: [{ id: col._id, order: 1, type: 'collection' }] },
    });

    await expect.poll(() => events.filter((e) => e === 'folder:updated').length, { timeout: 4000 }).toBeGreaterThan(0);
    await expect.poll(() => events.filter((e) => e === 'request:updated').length, { timeout: 4000 }).toBeGreaterThan(0);
    await expect.poll(() => events.filter((e) => e === 'environment:updated').length, { timeout: 4000 }).toBeGreaterThan(0);
    a.close();
    b.close();
  });
});

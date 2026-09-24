import { serverOrigin } from './helpers/baseUrl';
import { test, expect, APIRequestContext } from '@playwright/test';
import { io as ioClient } from '../client/node_modules/socket.io-client';


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
  const res = await request.post(`${serverOrigin()}/api/auth/register`, {
    data: { name: `RT ${suffix}`, email: `rt${suffix}@test.com`, password: 'password123' },
  });
  expect(res.ok(), 'register failed — is self-registration enabled (global-setup)?').toBeTruthy();
  const cookie = res.headers()['set-cookie']?.split(';')[0] || '';
  const wsRes = await request.get(`${serverOrigin()}/api/workspaces`, { headers: { cookie } });
  const workspaces = await wsRes.json();
  return { cookie, workspaceId: workspaces[0]._id as string };
}

function connectSocket(cookie: string) {
  return ioClient(serverOrigin(), { path: '/ws', extraHeaders: { cookie }, forceNew: true });
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

    const created = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Collection' },
    });
    const col = await created.json();

    await request.put(`${serverOrigin()}/api/collections/${col._id}`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Collection Renamed' },
    });
    await expect.poll(() => updated.length, { timeout: 3000 }).toBeGreaterThan(0);
    expect(updated[0].name).toBe('RT Collection Renamed');

    await request.delete(`${serverOrigin()}/api/collections/${col._id}`, { headers: { cookie: owner.cookie } });
    await expect.poll(() => deleted.length, { timeout: 3000 }).toBeGreaterThan(0);
    expect(String(deleted[0])).toBe(String(col._id));

    a.close();
    b.close();
  });

  test('folder, request, environment, and reorder events reach an observer', async ({ request }) => {
    test.setTimeout(30000);
    const owner = await registerAndGetWorkspace(request, 'tree');
    const a = connectSocket(owner.cookie);
    const b = connectSocket(owner.cookie);
    await Promise.all([once(a, 'connect'), once(b, 'connect')]);
    a.emit('join:workspace', owner.workspaceId);
    b.emit('join:workspace', owner.workspaceId);
    await new Promise((r) => setTimeout(r, 400));

    const seen: Record<string, unknown[]> = {
      'folder:created': [],
      'request:created': [],
      'environment:created': [],
      'workspace:reordered': [],
      'environment:updated': [],
    };
    for (const event of Object.keys(seen)) b.on(event, (payload: unknown) => seen[event].push(payload));

    const created = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Tree' },
    });
    const col = await created.json();

    const folderRes = await request.post(`${serverOrigin()}/api/collections/${col._id}/folders`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Folder' },
    });
    expect(folderRes.ok()).toBeTruthy();

    const reqRes = await request.post(`${serverOrigin()}/api/collections/${col._id}/requests`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Request', method: 'GET', url: 'https://example.com' },
    });
    expect(reqRes.ok()).toBeTruthy();
    const saved = await reqRes.json();

    const envRes = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/environments`, {
      headers: { cookie: owner.cookie },
      data: { name: 'RT Env', variables: [] },
    });
    expect(envRes.ok()).toBeTruthy();

    const reorder = await request.put(`${serverOrigin()}/api/reorder`, {
      headers: { cookie: owner.cookie },
      data: { type: 'request', items: [{ id: saved._id || saved.id, order: 3 }] },
    });
    expect(reorder.ok()).toBeTruthy();

    const envReorder = await request.put(`${serverOrigin()}/api/environments/reorder`, {
      headers: { cookie: owner.cookie },
      data: { items: [{ id: (await envRes.json())._id, order: 2 }] },
    });
    expect(envReorder.ok()).toBeTruthy();

    await expect.poll(() => seen['folder:created'].length, { timeout: 3000 }).toBeGreaterThan(0);
    await expect.poll(() => seen['request:created'].length, { timeout: 3000 }).toBeGreaterThan(0);
    await expect.poll(() => seen['environment:created'].length, { timeout: 3000 }).toBeGreaterThan(0);
    await expect.poll(() => seen['workspace:reordered'].length, { timeout: 3000 }).toBeGreaterThan(0);
    await expect.poll(() => seen['environment:updated'].length, { timeout: 3000 }).toBeGreaterThan(0);

    a.close();
    b.close();
  });
});

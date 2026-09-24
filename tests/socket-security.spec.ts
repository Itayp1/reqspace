import { serverOrigin } from './helpers/baseUrl';
import { test, expect, APIRequestContext } from '@playwright/test';
// Node-side socket, reaching directly into the client's socket.io-client
// install — this probes the server's own connection-time auth/authz checks
// without going through the browser or the UI.
import { io as ioClient } from '../client/node_modules/socket.io-client';


/**
 * Regression coverage for the workspace-room auth hole in server/src/index.ts:
 * `join:workspace` used to join any socket to any workspace's room with zero
 * checks (and CORS was `origin: '*'`), so anyone who knew or guessed a
 * workspaceId could read that workspace's live collection/request/environment
 * broadcasts without ever logging in. The fix requires a valid session cookie
 * *and* workspace membership (or superadmin) before the join is honored.
 */

async function registerAndGetCookie(request: APIRequestContext, label: string) {
  const suffix = `${label}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await request.post(`${serverOrigin()}/api/auth/register`, {
    data: { name: `Sec ${suffix}`, email: `sec${suffix}@test.com`, password: 'password123' },
  });
  expect(res.ok()).toBeTruthy();
  const cookie = res.headers()['set-cookie']?.split(';')[0] || '';

  const workspacesRes = await request.get(`${serverOrigin()}/api/workspaces`, { headers: { cookie } });
  const workspaces = await workspacesRes.json();
  return { cookie, workspaceId: workspaces[0]._id as string };
}

function connectSocket(cookie: string) {
  return ioClient(serverOrigin(), {
    path: '/ws',
    extraHeaders: cookie ? { cookie } : {},
    forceNew: true,
  });
}

function waitFor(socket: any, event: string) {
  return new Promise<void>(resolve => socket.once(event, () => resolve()));
}

test.describe('Socket.IO authorization (workspace rooms must not leak to non-members)', () => {
  test('an unauthenticated socket cannot join a workspace room and receives none of its events', async ({ request }) => {
    const owner = await registerAndGetCookie(request, 'own');

    // Two legitimate sockets already in the room, so the server's "only
    // broadcast when the room has >1 occupant" optimization can't itself
    // explain a silent attacker below — a real 3rd occupant would still
    // receive the broadcast regardless of that optimization.
    const ownerSocketA = connectSocket(owner.cookie);
    const ownerSocketB = connectSocket(owner.cookie);
    await Promise.all([waitFor(ownerSocketA, 'connect'), waitFor(ownerSocketB, 'connect')]);
    ownerSocketA.emit('join:workspace', owner.workspaceId);
    ownerSocketB.emit('join:workspace', owner.workspaceId);

    const attacker = connectSocket(''); // no auth cookie at all
    await waitFor(attacker, 'connect');
    attacker.emit('join:workspace', owner.workspaceId);

    const received: unknown[] = [];
    attacker.on('collection:created', (c: unknown) => received.push(c));

    await new Promise(r => setTimeout(r, 400)); // let the (rejected) join settle

    const createRes = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Security Probe A' },
    });
    expect(createRes.ok()).toBeTruthy();

    await new Promise(r => setTimeout(r, 800));
    expect(received).toHaveLength(0);

    for (const s of [ownerSocketA, ownerSocketB, attacker]) s.disconnect();
  });

  test('a logged-in user who is not a member of the workspace cannot join it or receive its events', async ({ request }) => {
    const owner = await registerAndGetCookie(request, 'own2');
    const outsider = await registerAndGetCookie(request, 'out');

    const ownerSocketA = connectSocket(owner.cookie);
    const ownerSocketB = connectSocket(owner.cookie);
    await Promise.all([waitFor(ownerSocketA, 'connect'), waitFor(ownerSocketB, 'connect')]);
    ownerSocketA.emit('join:workspace', owner.workspaceId);
    ownerSocketB.emit('join:workspace', owner.workspaceId);

    const outsiderSocket = connectSocket(outsider.cookie);
    await waitFor(outsiderSocket, 'connect');
    outsiderSocket.emit('join:workspace', owner.workspaceId); // knows/guesses the id, but isn't a member

    const received: unknown[] = [];
    outsiderSocket.on('collection:created', (c: unknown) => received.push(c));

    await new Promise(r => setTimeout(r, 400));

    const createRes = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Security Probe B' },
    });
    expect(createRes.ok()).toBeTruthy();

    await new Promise(r => setTimeout(r, 800));
    expect(received).toHaveLength(0);

    for (const s of [ownerSocketA, ownerSocketB, outsiderSocket]) s.disconnect();
  });

  test('sanity check: a legitimate second member of the workspace does receive its events', async ({ request }) => {
    const owner = await registerAndGetCookie(request, 'own3');

    const ownerSocketA = connectSocket(owner.cookie);
    const ownerSocketB = connectSocket(owner.cookie);
    await Promise.all([waitFor(ownerSocketA, 'connect'), waitFor(ownerSocketB, 'connect')]);
    ownerSocketA.emit('join:workspace', owner.workspaceId);
    ownerSocketB.emit('join:workspace', owner.workspaceId);

    const received: unknown[] = [];
    ownerSocketB.on('collection:created', (c: unknown) => received.push(c));

    await new Promise(r => setTimeout(r, 300));

    const createRes = await request.post(`${serverOrigin()}/api/workspaces/${owner.workspaceId}/collections`, {
      headers: { cookie: owner.cookie },
      data: { name: 'Security Probe C' },
    });
    expect(createRes.ok()).toBeTruthy();

    await expect.poll(() => received.length, { timeout: 3000 }).toBeGreaterThan(0);

    for (const s of [ownerSocketA, ownerSocketB]) s.disconnect();
  });
});

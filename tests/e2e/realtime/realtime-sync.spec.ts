import { test, expect, API_URL } from '../fixtures';
import { selectWorkspace, expectWorkspaceListed, registerUser, apiAs, treeNode } from '../helpers';
import { io } from 'socket.io-client';


// SOCK-1: a socket event must mutate the observer's store in place — no
// HTTP. Before this task, SocketSync.tsx's handleUpdate refetched the whole
// tree (fetchCollectionsData) on every structural event; renaming a single
// collection cost every other viewer a full 1+2N request storm (PERF-1).
test('a rename from another user updates the sidebar with zero HTTP requests', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const timestamp = Date.now();
  const emailA = `sockA_${timestamp}@example.com`;
  const emailB = `sockB_${timestamp}@example.com`;
  const password = 'password123';

  await pageA.goto('/register');
  await pageA.getByTestId('register-name').fill('Sock A');
  await pageA.getByTestId('register-email').fill(emailA);
  await pageA.getByTestId('register-password').fill(password);
  await pageA.getByTestId('register-submit').click();
  await expect(pageA).toHaveURL(/.*\/$/);

  await pageB.goto('/register');
  await pageB.getByTestId('register-name').fill('Sock B');
  await pageB.getByTestId('register-email').fill(emailB);
  await pageB.getByTestId('register-password').fill(password);
  await pageB.getByTestId('register-submit').click();
  await expect(pageB).toHaveURL(/.*\/$/);

  const wsName = `Sock WS ${timestamp}`;
  await pageA.getByTestId('new-workspace-btn').click();
  await pageA.getByTestId('prompt-input').fill(wsName);
  await pageA.getByTestId('prompt-submit').click();
  await expectWorkspaceListed(pageA, wsName);

  await pageA.getByTestId('new-collection-empty-btn').click();
  await pageA.getByTestId('prompt-input').fill('Sock Collection');
  await pageA.getByTestId('prompt-input').press('Enter');
  await expect(pageA.getByTestId('node-Sock Collection')).toBeVisible();

  await pageA.getByTestId('workspace-settings-btn').click();
  await pageA.getByTestId('workspace-members-tab').click();
  await pageA.getByTestId('user-autocomplete-input').fill(emailB);
  await pageA.getByTestId('workspace-invite-btn').click();
  await expect(pageA.getByTestId('invite-email').filter({ hasText: emailB })).toBeVisible();
  await pageA.getByTestId('close-workspace-modal').click();

  await pageB.reload();
  await expectWorkspaceListed(pageB, wsName);
  // FIX-9: fetchCollectionsData applies whichever response lands last with
  // no staleness guard. Switching workspace before the mount effect's fetch
  // for B's own default workspace has settled lets the two race, and the
  // default's (empty) result can win and clobber "Sock WS"'s data. Wait for
  // the mount fetch to settle first so only one fetch is ever in flight.
  await expect(pageB.getByText(/no collections yet/i).or(pageB.getByTestId('node-container').first())).toBeVisible();
  await selectWorkspace(pageB, { label: wsName });
  await expect(pageB.getByTestId('node-Sock Collection')).toBeVisible();
  // The workspace switch's own fetchCollectionsData issues per-collection
  // folder/request fetches after the collections list itself resolves (and
  // React StrictMode double-invokes the effect in dev) — wait for that to
  // fully settle before counting, or this test would flag its own initial
  // load, not a socket-triggered refetch.
  await pageB.waitForLoadState('networkidle');

  // Only start counting once B has finished loading the workspace it just
  // switched into — everything before this point is legitimate initial-load
  // traffic, not what this test is about.
  const requestsAfterLoad: string[] = [];
  pageB.on('request', (req) => {
    const url = req.url();
    if (req.method() === 'GET' && (/\/collections(\?|$)/.test(url) || /\/collections\/[^/]+\/(folders|requests)$/.test(url) || /\/workspaces\/[^/]+\/tree$/.test(url))) {
      requestsAfterLoad.push(`${req.method()} ${url}`);
    }
  });

  await pageA.getByTestId('node-Sock Collection').dblclick();
  await pageA.getByTestId('inline-rename-input').fill('Renamed Sock Collection');
  await pageA.keyboard.press('Enter');

  await expect(pageB.getByTestId('node-Renamed Sock Collection')).toBeVisible({ timeout: 15000 });

  expect(requestsAfterLoad).toEqual([]);

  await contextA.close();
  await contextB.close();
});


test.describe('WebSocket Advanced Sync', () => {
  test('Folder rename and Global variables sync between users', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    const timestamp = Date.now();
    const emailA = `userA_${timestamp}@example.com`;
    const emailB = `userB_${timestamp}@example.com`;
    const pass = 'password123';

    // 1. Register User B
    await pageB.goto('/register');
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(emailB);
    await pageB.getByTestId('register-password').fill(pass);
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*\/$/);
    
    // 2. Register User A
    await pageA.goto('/register');
    await pageA.getByTestId('register-name').fill('User A');
    await pageA.getByTestId('register-email').fill(emailA);
    await pageA.getByTestId('register-password').fill(pass);
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*\/$/);

    // 3. User A creates Workspace
    await pageA.getByTestId('new-workspace-btn').click();
    await pageA.getByTestId('prompt-input').fill(`WS_${timestamp}`);
    await pageA.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(pageA, `WS_${timestamp}`);

    // 4. User A invites User B
    await pageA.getByTestId('workspace-settings-btn').click();
    await pageA.getByTestId('workspace-members-tab').click();
    await pageA.getByTestId('user-autocomplete-input').fill(emailB);
    await pageA.getByTestId('workspace-invite-btn').click();
    await expect(pageA.getByTestId('invite-email').filter({ hasText: emailB })).toBeVisible();
    await pageA.getByTestId('close-workspace-modal').click();

    // 5. User B switches to the workspace
    await pageB.reload();
    await expectWorkspaceListed(pageB, `WS_${timestamp}`);
    await selectWorkspace(pageB, { label: `WS_${timestamp}` });

    // 6. User A creates a Collection and Folder
    await pageA.getByTestId('new-collection-empty-btn').click();
    await pageA.getByTestId('prompt-input').fill('Sync Collection');
    await pageA.getByTestId('prompt-input').press('Enter');
    await expect(pageA.getByTestId('node-Sync Collection')).toBeVisible();

    await pageA.getByTestId('node-Sync Collection').hover();
    await pageA.locator('[data-testid="node-container"]', { has: pageA.getByTestId('node-Sync Collection') }).getByTestId('action-menu-btn').click();
    await pageA.getByTestId('action-menu-new-folder').click();
    await pageA.getByTestId('prompt-input').fill('Sync Folder');
    await pageA.getByTestId('prompt-input').press('Enter');
    
    await expect(pageA.getByTestId('node-Sync Folder')).toBeVisible();

    // 7. User B sees the folder
    await expect(pageB.getByTestId('node-Sync Collection')).toBeVisible({ timeout: 15000 });
    await pageB.getByTestId('node-Sync Collection').click();
    await expect(pageB.getByTestId('node-Sync Folder')).toBeVisible({ timeout: 15000 });

    // 8. User A renames the folder
    await pageA.getByTestId('node-Sync Folder').dblclick();
    await pageA.getByTestId('inline-rename-input').fill('Renamed Folder');
    await pageA.keyboard.press('Enter');

    // 9. User B sees renamed folder
    await expect(pageB.getByTestId('node-Renamed Folder')).toBeVisible({ timeout: 15000 });

    // 10. Global Variables Sync
    await pageA.getByTestId('tab-environments').click();
    await pageA.getByTestId('env-globals-btn').click();
    await pageA.getByTestId('add-env-var-btn').click();
    await pageA.getByTestId('env-var-key-0').fill('GlobalKey');
    await pageA.getByTestId('env-var-current-0').fill('GlobalVal');
    await pageA.getByTestId('env-save-btn').click();

    await pageB.getByTestId('tab-environments').click();
    await pageB.getByTestId('env-globals-btn').click();
    await expect(pageB.getByTestId('env-var-key-0')).toHaveValue('GlobalKey', { timeout: 15000 });
    await expect(pageB.getByTestId('env-var-current-0')).toHaveValue('GlobalVal', { timeout: 15000 });

    // Clean up
    await contextA.close();
    await contextB.close();
  });
});


/**
 * A move made by one user must show up for everyone else as a move, not a
 * copy. The socket reducers used to add the item to its new parent without
 * taking it out of the old one, so collaborators saw it in both places until
 * they reloaded.
 */
test('a request and a folder moved by a teammate appear once, in their new place', async ({ page, browser }) => {
  const ts = Date.now();
  // User B (the observer) uses the page; User A works through the API.
  const emailB = await registerUser(page, 'move_observer', 'Observer');
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const emailA = await registerUser(pageA, 'move_actor', 'Actor');
  await ctxA.close();

  const a = await apiAs(emailA);
  const ws = await (await a.post('/api/workspaces', { data: { name: `Move WS ${ts}` } })).json();
  expect((await a.post(`/api/workspaces/${ws._id}/members`, { data: { email: emailB, role: 'editor' } })).status()).toBe(201);
  const col = await (await a.post(`/api/workspaces/${ws._id}/collections`, { data: { name: 'Move Col' } })).json();
  const from = await (await a.post(`/api/collections/${col._id}/folders`, { data: { name: 'From Folder' } })).json();
  const to = await (await a.post(`/api/collections/${col._id}/folders`, { data: { name: 'To Folder' } })).json();
  const sub = await (await a.post(`/api/collections/${col._id}/folders`, { data: { name: 'Sub Folder', parentFolderId: from._id } })).json();
  const req = await (await a.post(`/api/collections/${col._id}/requests`, { data: { name: 'Traveller', method: 'GET', url: 'https://move.example.test', folderId: from._id } })).json();

  await page.reload();
  await selectWorkspace(page, ws._id);
  await treeNode(page, 'Move Col').click();
  await treeNode(page, 'From Folder').click();
  await treeNode(page, 'To Folder').click();
  await expect(page.getByTestId('node-Traveller')).toHaveCount(1);
  await expect(page.getByTestId('node-Sub Folder')).toHaveCount(1);

  // Move the request; the observer sees it leave one folder and enter the other.
  expect((await a.put(`/api/requests/${req._id}`, { data: { folderId: to._id } })).status()).toBe(200);
  // The innermost subtree wrapper that holds the To Folder row (the
  // collection's wrapper contains it too, and comes first in the DOM).
  const toFolder = page.locator('div.select-none', { has: page.getByTestId('node-To Folder') }).last();
  await expect(toFolder.getByTestId('node-Traveller')).toBeVisible();
  await expect(page.getByTestId('node-Traveller')).toHaveCount(1);

  // Same for a folder.
  expect((await a.put(`/api/folders/${sub._id}`, { data: { parentFolderId: to._id } })).status()).toBe(200);
  await expect(toFolder.getByTestId('node-Sub Folder')).toBeVisible();
  await expect(page.getByTestId('node-Sub Folder')).toHaveCount(1);
  await a.dispose();
});


test.describe('Socket events coverage', () => {
  test('Cover all 13 event families via direct socket connection', async ({ request, baseURL }) => {
    // 1. Login as admin and get cookie
    // We will override baseURL for API calls
    const apiUrl = API_URL + '/api';
    let res = await request.post(`${apiUrl}/auth/login`, {
      data: { email: 'admin', password: 'admin123456' }
    });
    if (!res.ok()) {
      res = await request.post(`${apiUrl}/auth/login`, {
        data: { email: 'admin', password: 'admin123456' }
      });
    }
    if (!res.ok()) {
      throw new Error('Admin login failed: ' + await res.text());
    }
    // The login now sets several cookies (token + logged_in flag); send them back as one Cookie header.
    const cookieHeader = res.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie').map(h => h.value.split(';')[0]).join('; ');
    
    // Get workspaces
    const wsRes = await request.get(`${apiUrl}/workspaces`, { headers: { Cookie: cookieHeader } });
    const wsList = await wsRes.json();
    const wsId = wsList[0]._id;
    
    // 2. Connect socket
    const socket = io(API_URL, {
      path: '/ws',
      extraHeaders: { Cookie: cookieHeader },
      transports: ['websocket']
    });

    await new Promise<void>(resolve => {
      socket.on('connect', () => {
        socket.emit('join:workspace', wsId);
        setTimeout(resolve, 500); // Give server time to check auth and join room
      });
    });

    const receivedEvents = new Set<string>();
    const expectedEvents = [
      'collection:created', 'collection:updated', 'collection:deleted',
      'folder:created', 'folder:updated', 'folder:deleted',
      'request:created', 'request:updated', 'request:deleted',
      'workspace:reordered',
      'environment:created', 'environment:updated', 'environment:deleted'
    ];

    expectedEvents.forEach(evt => {
      socket.on(evt, () => receivedEvents.add(evt));
    });

    // 3. Trigger events
    const headers = { Cookie: cookieHeader };
    // Create Environment
    let envRes = await request.post(`${apiUrl}/workspaces/${wsId}/environments`, { data: { name: 'E1' }, headers });
    const envId = (await envRes.json())._id;
    // Update Environment
    await request.put(`${apiUrl}/environments/${envId}`, { data: { name: 'E2' }, headers });
    // Delete Environment
    await request.delete(`${apiUrl}/environments/${envId}`, { headers });

    // Create Collection
    let colRes = await request.post(`${apiUrl}/workspaces/${wsId}/collections`, { data: { name: 'C1' }, headers });
    const colId = (await colRes.json())._id;
    // Update Collection
    await request.put(`${apiUrl}/collections/${colId}`, { data: { name: 'C2' }, headers });

    // Create Folder
    let folRes = await request.post(`${apiUrl}/collections/${colId}/folders`, { data: { name: 'F1' }, headers });
    const folId = (await folRes.json())._id;
    // Update Folder
    await request.put(`${apiUrl}/folders/${folId}`, { data: { name: 'F2' }, headers });

    // Create Request
    let reqRes = await request.post(`${apiUrl}/collections/${colId}/requests`, { data: { name: 'R1', method: 'GET', folderId: folId, url: 'https://example.com' }, headers });
    const reqId = (await reqRes.json())._id;
    // Update Request
    await request.put(`${apiUrl}/requests/${reqId}`, { data: { name: 'R2', method: 'POST' }, headers });
    
    // Reorder
    await request.put(`${apiUrl}/collections/reorder`, { 
      data: { type: 'request', items: [{ id: reqId, order: 1 }] }, headers 
    });

    // Delete Request
    await request.delete(`${apiUrl}/requests/${reqId}`, { headers });
    // Delete Folder
    await request.delete(`${apiUrl}/folders/${folId}`, { headers });
    // Delete Collection
    await request.delete(`${apiUrl}/collections/${colId}`, { headers });

    // 4. Wait a bit for events to arrive
    await new Promise(r => setTimeout(r, 1000));
    socket.disconnect();

    console.log('receivedEvents:', Array.from(receivedEvents));

    // 5. Assert all expected events were received
    for (const evt of expectedEvents) {
      expect(receivedEvents.has(evt), `Expected socket to receive event: ${evt}`).toBeTruthy();
    }
  });
});

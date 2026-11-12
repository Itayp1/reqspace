import { test, expect } from './fixtures';
import { API_URL } from './fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { registerUser, loginUi, apiAs, apiAsAdmin, treeNode, openNodeMenu, addViaMenu, createCollectionUi } from './helpers';

/**
 * Group 1 of MANUAL_TEST_PLAN_FAILED.md (auth / workspace realtime / tree).
 * One test per plan id, titled "[id] …", asserting the CORRECT behaviour.
 * `test.fail()` marks a bug that is still present.
 */

let seq = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function anon(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
}

async function newUser(prefix: string) {
  const email = `${uniq(prefix)}@example.com`;
  const ctx = await anon();
  const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
  expect(res.status(), 'register').toBe(201);
  const body = await res.json();
  return { ctx, email, id: (body.user?.id ?? body.user?._id) as string };
}

const idOf = (o: any): string => o.id ?? o._id;

/** Logs in over HTTP and returns the Cookie header for a socket.io handshake. */
async function cookieFor(email: string, password = 'password123'): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip() },
    body: JSON.stringify({ email, password }),
  });
  expect(res.ok, 'login for socket').toBeTruthy();
  const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined;
  return (setCookies || [res.headers.get('set-cookie') || '']).map(c => c.split(';')[0]).join('; ');
}

async function connectSocket(cookie: string, workspaceId?: string): Promise<Socket> {
  const socket = io(API_URL, { path: '/ws', extraHeaders: { Cookie: cookie }, transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  if (workspaceId) {
    socket.emit('join:workspace', workspaceId);
    await new Promise(r => setTimeout(r, 500));
  }
  return socket;
}

async function seedWorkspace(owner: APIRequestContext, name = uniq('ws')) {
  const res = await owner.post('/api/workspaces', { data: { name } });
  expect(res.ok(), 'create workspace').toBeTruthy();
  return idOf(await res.json());
}

// ───────────────────────────── A — auth ─────────────────────────────
test.describe('A — auth & accounts (UI / sockets)', () => {
  test.use({ allowFpErrors: [/Network Error/] });
  test('[A1.10] double-clicking Sign In sends a single login request', async ({ page }) => {
    const { email } = await newUser('a110');
    let logins = 0;
    await page.route('**/api/auth/login', async route => {
      logins++;
      await new Promise(r => setTimeout(r, 400));
      await route.continue();
    });
    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').dblclick();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    expect(logins).toBe(1);
  });

  test('[A1.11] a signed-in user opening /login is sent to the app', async ({ page }) => {
    await registerUser(page, 'a111');
    await page.goto('/login');
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('[A4.6] logging out while offline still clears the session and lands on /login', async ({ page }) => {
    await registerUser(page, 'a46');
    // The logout request fails at the network level (server unreachable).
    await page.route('**/api/auth/logout', route => route.abort('internetdisconnected'));
    await page.getByTestId('logout-btn').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('[A9.3] suspending a user disconnects their live WebSocket', async () => {
    const owner = await newUser('a93o');
    const victim = await newUser('a93v');
    const wsId = await seedWorkspace(owner.ctx);
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: victim.email, role: 'viewer' } })).status()).toBe(201);
    const sock = await connectSocket(await cookieFor(victim.email), wsId);
    try {
      let disconnected = false;
      sock.on('disconnect', () => { disconnected = true; });
      const admin = await apiAsAdmin();
      const res = await admin.post(`/api/admin/users/${victim.id}/suspend`, { data: { suspended: true } });
      expect(res.ok(), 'suspend').toBeTruthy();
      await expect.poll(() => disconnected, { timeout: 5000 }).toBe(true);
    } finally {
      sock.close();
    }
  });
});

// ───────────────────────────── B — workspaces ─────────────────────────────
test.describe('B — workspaces realtime / UI', () => {
  test('[B1.7/B3.3] deleting a workspace moves its connected members away and tells them', async ({ page }) => {
    const owner = await newUser('b17o');
    const memberEmail = await registerUser(page, 'b17m');
    const wsName = uniq('Doomed');
    const wsId = await seedWorkspace(owner.ctx, wsName);
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role: 'editor' } })).status()).toBe(201);
    await page.reload();
    await page.getByTestId('workspace-select').selectOption(wsId);
    await expect(page.getByTestId('workspace-select')).toHaveValue(wsId);
    await page.waitForTimeout(800); // let the socket join the room

    expect((await owner.ctx.delete(`/api/workspaces/${wsId}`)).status()).toBe(200);

    await expect(page.getByTestId('toast-info').filter({ hasText: /deleted/i }).first()).toBeVisible();
    await expect(page.getByTestId('workspace-select')).not.toHaveValue(wsId);
    await expect(page.getByTestId('workspace-select').locator(`option[value="${wsId}"]`)).toHaveCount(0);
  });

  test('[B2.1] renaming a workspace updates other members live', async ({ page }) => {
    const owner = await newUser('b21o');
    const memberEmail = await registerUser(page, 'b21m');
    const wsId = await seedWorkspace(owner.ctx, uniq('OldName'));
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role: 'editor' } })).status()).toBe(201);
    await page.reload();
    await page.getByTestId('workspace-select').selectOption(wsId);
    await page.waitForTimeout(800);
    const newName = uniq('Renamed');
    expect((await owner.ctx.put(`/api/workspaces/${wsId}`, { data: { name: newName } })).status()).toBe(200);
    await expect(page.getByTestId('workspace-select').locator(`option[value="${wsId}"]`)).toHaveText(newName);
  });

  test('[B4.7] member search is debounced: typing 5 chars quickly fires one /users/search', async ({ page }) => {
    await registerUser(page, 'b47');
    const searches: string[] = [];
    await page.route('**/api/users/search**', async route => {
      searches.push(new URL(route.request().url()).searchParams.get('q') || '');
      await route.continue();
    });
    await page.getByTestId('workspace-settings-btn').click();
    await page.getByTestId('workspace-members-tab').click();
    const input = page.getByPlaceholder(/email|user/i).first();
    await input.click();
    await input.pressSequentially('abcde', { delay: 30 });
    await page.waitForTimeout(900);
    expect(searches.length, `queries: ${searches.join(',')}`).toBeLessThanOrEqual(1);
  });

  test('[B6.2] removing a member drops the workspace from their UI live', async ({ page }) => {
    const owner = await newUser('b62o');
    const memberEmail = await registerUser(page, 'b62m');
    const wsId = await seedWorkspace(owner.ctx);
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role: 'editor' } })).status()).toBe(201);
    await page.reload();
    await page.getByTestId('workspace-select').selectOption(wsId);
    await page.waitForTimeout(800);
    const detail = await (await owner.ctx.get(`/api/workspaces/${wsId}`)).json();
    const m = detail.members.find((x: any) => JSON.stringify(x).includes(memberEmail));
    const memberUserId = m.userId?._id ?? m.userId;
    expect((await owner.ctx.delete(`/api/workspaces/${wsId}/members/${memberUserId}`)).ok()).toBeTruthy();
    await expect(page.getByTestId('workspace-select').locator(`option[value="${wsId}"]`)).toHaveCount(0);
  });

  test('[B6.6] a removed member socket stops receiving workspace events', async () => {
    const owner = await newUser('b66o');
    const member = await newUser('b66m');
    const wsId = await seedWorkspace(owner.ctx);
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: member.email, role: 'editor' } })).status()).toBe(201);
    const col = await (await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
    const sock = await connectSocket(await cookieFor(member.email), wsId);
    try {
      const got: string[] = [];
      sock.on('request:created', () => got.push('request:created'));
      expect((await owner.ctx.delete(`/api/workspaces/${wsId}/members/${member.id}`)).ok()).toBeTruthy();
      await new Promise(r => setTimeout(r, 500));
      const r = await owner.ctx.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'after-removal', method: 'GET', url: 'https://x.test' } });
      expect(r.ok()).toBeTruthy();
      await new Promise(r2 => setTimeout(r2, 1000));
      expect(got).toEqual([]);
    } finally {
      sock.close();
    }
  });
});

// C — tree
async function seedTreeUser(page: Page, prefix: string) {
  const email = await registerUser(page, prefix);
  const api = await apiAs(email);
  const wsList = await (await api.get('/api/workspaces')).json();
  const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
  return { email, api, wsId: idOf(ws) };
}

const tabs = (page: Page, text: string) => page.locator('[data-testid^="tab-"]').filter({ hasText: text });
const menuItem = (page: Page, re: RegExp) => page.locator('[data-testid^="action-menu-"]', { hasText: re }).first();

test.describe('C — collection tree', () => {
  test.use({ allowFpErrors: [/Network Error/] });

  test('[C1.8] a viewer is not offered editing actions in the tree menu', async ({ page }) => {
    const owner = await newUser('c18o');
    const viewerEmail = await registerUser(page, 'c18v');
    const wsId = await seedWorkspace(owner.ctx);
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).status()).toBe(201);
    await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'ViewerCol' } });
    await page.reload();
    await page.getByTestId('workspace-select').selectOption(wsId);
    await expect(page.getByTestId('node-ViewerCol')).toBeVisible();
    await openNodeMenu(page, 'ViewerCol');
    for (const re of [/new request/i, /new folder/i, /rename/i, /delete/i, /duplicate/i]) {
      await expect(menuItem(page, re), String(re)).toHaveCount(0);
    }
  });

  test('[C2.4] renaming a request in the tree updates its open tab title', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c24');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C24' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'OldReq', method: 'GET', url: 'https://c24.test' } });
    await page.reload();
    await treeNode(page, 'C24').click();
    await page.getByTestId('node-OldReq').click();
    await expect(tabs(page, 'OldReq')).toHaveCount(1);
    await treeNode(page, 'OldReq').dblclick();
    await page.getByTestId('inline-rename-input').fill('NewReq');
    await page.getByTestId('inline-rename-input').press('Enter');
    await expect(page.getByTestId('node-NewReq')).toBeVisible();
    await expect(tabs(page, 'NewReq')).toHaveCount(1);
    await expect(tabs(page, 'OldReq')).toHaveCount(0);
  });

  test('[C3.1] deleting a request closes (or marks) its open tab, so Save cannot 404', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c31');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C31' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'Doomed', method: 'GET', url: 'https://c31.test' } });
    await page.reload();
    await treeNode(page, 'C31').click();
    await page.getByTestId('node-Doomed').click();
    await expect(tabs(page, 'Doomed')).toHaveCount(1);
    await openNodeMenu(page, 'Doomed');
    await menuItem(page, /delete/i).click();
    await page.getByTestId('confirm-btn').click();
    await expect(page.getByTestId('node-Doomed')).toHaveCount(0);
    await expect(tabs(page, 'Doomed')).toHaveCount(0);
  });

  test('[C7.1] filter shows the matching request inside an auto-opened folder, and nothing unrelated', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c71');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C71' } })).json();
    const folder = await (await api.post(`/api/collections/${idOf(col)}/folders`, { data: { name: 'F1' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'copy me', method: 'GET', url: 'https://a.test', folderId: idOf(folder) } });
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'Health', method: 'GET', url: 'https://health.test' } });
    await page.reload();
    await page.getByPlaceholder('Filter requests...').fill('copy');
    await expect(page.getByTestId('node-copy me')).toBeVisible();
    await expect(page.getByTestId('node-Health')).toHaveCount(0);
  });

  test('[C7.2] tree filter is case-insensitive', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c72');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C72' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'lowercasereq', method: 'GET', url: 'https://l.test' } });
    await page.reload();
    await page.getByPlaceholder('Filter requests...').fill('LOWERCASE');
    await expect(page.getByTestId('node-lowercasereq')).toBeVisible();
  });

  test('[C7.6] typing in the filter of a large tree stays responsive (<200ms per keystroke)', async ({ page }) => {
    test.setTimeout(240_000);
    const { api, wsId } = await seedTreeUser(page, 'c76');
    const items = Array.from({ length: 2000 }, (_, i) => ({ name: `bulk request ${i}`, request: { method: 'GET', url: { raw: `https://bulk.test/${i}` } } }));
    const imp = await api.post('/api/collections/import', {
      data: { workspaceId: wsId, collection: { info: { name: 'Big', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: items } },
    });
    expect(imp.ok(), await imp.text()).toBeTruthy();
    await page.reload();
    await treeNode(page, 'Big').click();
    await expect(page.getByTestId('node-bulk request 5')).toBeVisible();
    const lat = await page.evaluate(async () => {
      const el = document.querySelector('input[placeholder="Filter requests..."]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const times: number[] = [];
      let v = '';
      for (const ch of 'bulk req') {
        v += ch;
        const t0 = performance.now();
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
        times.push(performance.now() - t0);
        await new Promise(r => setTimeout(r, 250));
      }
      return times;
    });
    const max = Math.max(...lat);
    expect(max, `latencies ${lat.map(x => Math.round(x)).join(',')}`).toBeLessThan(200);
  });

  test('[C9.5] collection documentation masks tokens and secrets until revealed', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c95');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C95' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, {
      data: { name: 'Secret req', method: 'GET', url: 'https://s.test', headers: [{ key: 'Authorization', value: 'Bearer SUPERSECRETTOKEN123', enabled: true }] },
    });
    await page.reload();
    await openNodeMenu(page, 'C95');
    await menuItem(page, /documentation/i).click();
    const modal = page.getByTestId('documentation-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('doc-request-Secret req')).toBeVisible();
    await expect(modal).not.toContainText('SUPERSECRETTOKEN123');
    await modal.getByTestId('doc-reveal-btn').first().click();
    await expect(modal).toContainText('SUPERSECRETTOKEN123');
  });

  test('[C10.4] duplicating a request twice yields distinct names', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c104');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C104' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'GetUser', method: 'GET', url: 'https://u.test' } });
    await page.reload();
    await treeNode(page, 'C104').click();
    for (let i = 0; i < 2; i++) {
      await openNodeMenu(page, 'GetUser');
      await menuItem(page, /duplicate/i).click();
      await expect(page.locator('[data-testid^="node-GetUser"]')).toHaveCount(i + 2);
    }
    const names = await page.locator('[data-testid^="node-GetUser"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
    expect(new Set(names).size).toBe(names.length);
  });

  test('[C10.5] a failure part-way through Copy to Workspace leaves no partial collection', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c105');
    const target = await (await api.post('/api/workspaces', { data: { name: uniq('Target') } })).json();
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C105' } })).json();
    for (const n of ['r1', 'r2', 'r3']) {
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: n, method: 'GET', url: `https://${n}.test` } });
    }
    await page.reload();
    let posts = 0;
    await page.route(/\/api\/collections\/[^/]+\/requests$/, async route => {
      if (route.request().method() === 'POST' && ++posts === 2) return route.abort('failed');
      return route.continue();
    });
    await openNodeMenu(page, 'C105');
    await menuItem(page, /copy to/i).click();
    await page.getByTestId('copy-target-workspace-select').selectOption(idOf(target));
    await page.getByRole('button', { name: /^copy$/i }).click();
    await page.waitForTimeout(1500);
    const cols = await (await api.get(`/api/workspaces/${idOf(target)}/collections`)).json();
    expect(cols.length, 'partial collection left in target').toBe(0);
  });

  test('[C10.6] Copy to Workspace dialog says variables/environments are not copied', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c106');
    await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C106' } });
    await page.reload();
    await openNodeMenu(page, 'C106');
    await menuItem(page, /copy to/i).click();
    await expect(page.getByTestId('copy-to-workspace-modal')).toContainText(/environments?.*not copied/i);
  });
});


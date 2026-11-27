import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { registerUser, apiAs, apiAsAdmin, treeNode, selectWorkspace } from '../helpers';

test.describe('workspace access over the socket', () => {
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

  test.describe('A — auth & accounts (UI / sockets)', () => {
    test.use({ allowFpErrors: [/Network Error/] });

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

  test.describe('B — workspaces realtime / UI', () => {
    test('[B1.7/B3.3] deleting a workspace moves its connected members away and tells them', async ({ page }) => {
      const owner = await newUser('b17o');
      const memberEmail = await registerUser(page, 'b17m');
      const wsName = uniq('Doomed');
      const wsId = await seedWorkspace(owner.ctx, wsName);
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role: 'editor' } })).status()).toBe(201);
      await page.reload();
      await selectWorkspace(page, wsId);
      await expect(page.getByTestId('workspace-select')).toHaveAttribute('data-value', wsId);
      await page.waitForTimeout(800); // let the socket join the room

      expect((await owner.ctx.delete(`/api/workspaces/${wsId}`)).status()).toBe(200);

      await expect(page.getByTestId('toast-info').filter({ hasText: /deleted/i }).first()).toBeVisible();
      await expect(page.getByTestId('workspace-select')).not.toHaveAttribute('data-value', wsId);
      await page.getByTestId('workspace-select').click();
      await expect(page.getByTestId(`workspace-option-${wsId}`)).toHaveCount(0);
      await page.keyboard.press('Escape');
    });

    test('[B2.1] renaming a workspace updates other members live', async ({ page }) => {
      const owner = await newUser('b21o');
      const memberEmail = await registerUser(page, 'b21m');
      const wsId = await seedWorkspace(owner.ctx, uniq('OldName'));
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role: 'editor' } })).status()).toBe(201);
      await page.reload();
      await selectWorkspace(page, wsId);
      await page.waitForTimeout(800);
      const newName = uniq('Renamed');
      expect((await owner.ctx.put(`/api/workspaces/${wsId}`, { data: { name: newName } })).status()).toBe(200);
      await page.getByTestId('workspace-select').click();
      await expect(page.getByTestId(`workspace-option-${wsId}`)).toHaveText(newName);
      await page.keyboard.press('Escape');
    });

    test('[B6.6] a removed member socket stops receiving workspace events', async () => {
      const owner = await newUser('b66o');
      const member = await newUser('b66m');
      const wsId = await seedWorkspace(owner.ctx);
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: member.email, role: 'editor' } })).status()).toBe(201);
      await member.ctx.get('/api/workspaces'); // a pending invite becomes a membership on the invitee's next request
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

});

test.describe('realtime access changes', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  async function setup(browser: any, page: Page, role: 'viewer' | 'editor') {
    const ownerEmail = await registerUser(page, 'n112own');
    const owner = await apiAs(ownerEmail);
    const ws = await (await owner.post('/api/workspaces', { data: { name: `N112 ${Date.now()}` } })).json();
    const wsId: string = ws.id ?? ws._id;
    await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Live Col' } });
    const mctx = await browser.newContext();
    const mpage = await mctx.newPage();
    const memberEmail = await registerUser(mpage, 'n112mem');
    expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role } })).ok()).toBeTruthy();
    const member = await apiAs(memberEmail);
    const me = await (await member.get('/api/auth/me')).json();
    const memberId: string = me.user?.id ?? me.user?._id ?? me.id ?? me._id;
    await mpage.reload();
    await selectWorkspace(mpage, wsId);
    await expect(treeNode(mpage, 'Live Col')).toBeVisible();
    return { owner, wsId, mpage, mctx, memberId };
  }

  test('[N1.12] removing a member is pushed live: the removed member loses the workspace without reloading', async ({ page, browser }) => {
    const { owner, wsId, mpage, mctx, memberId } = await setup(browser, page, 'editor');
    const res = await owner.delete(`/api/workspaces/${wsId}/members/${memberId}`);
    expect(res.ok()).toBeTruthy();
    await expect(treeNode(mpage, 'Live Col')).toHaveCount(0, { timeout: 8000 });
    await mpage.getByTestId('workspace-select').click();
    await expect(mpage.getByTestId(`workspace-option-${wsId}`)).toHaveCount(0);
    await mpage.keyboard.press('Escape');
    await mctx.close();
  });

  test('[N1.12] a role change is pushed live to the member', async ({ page, browser }) => {
    const { owner, wsId, mpage, mctx, memberId } = await setup(browser, page, 'viewer');
    const res = await owner.put(`/api/workspaces/${wsId}/members/${memberId}`, { data: { role: 'editor' } });
    expect(res.ok()).toBeTruthy();
    await expect(mpage.getByTestId('toast-info').filter({ hasText: /role .* is now editor/i }).first()).toBeVisible({ timeout: 8000 });
    await mctx.close();
  });
});

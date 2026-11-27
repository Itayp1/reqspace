import { test, expect } from '../fixtures';
import { loginUi, registerUser, activeWorkspaceId } from '../helpers';
import { PASSWORD, newCtx, makeUser, makeWorkspace, createLink, members, openSettingsTab } from './invite-helpers';
import fs from 'fs';
import path from 'path';

// 4xx answers (410 gone, 404 unknown, 403) are the point of several tests; the browser reports 401/403 as failed API calls.
test.use({ allowFpErrors: [/server-auth|status code 40[13]/] });

test.describe('invite links API', () => {
  test('create returns the token once; accept adds the member with the link role', async () => {
    const owner = await makeUser('lnk_owner');
    const joiner = await makeUser('lnk_joiner');
    const ws = await makeWorkspace(owner.ctx, 'Link Target WS');
    const { link, token } = await createLink(owner.ctx, ws, { role: 'editor' });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ms = new Date(link.expiresAt).getTime() - Date.now();
    expect(ms).toBeGreaterThan(55 * 60_000);
    expect(ms).toBeLessThanOrEqual(60 * 60_000 + 5000);

    const list = await (await owner.ctx.get(`/api/workspaces/${ws}/invite-links`)).json();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(token);

    const info = await (await joiner.ctx.get(`/api/invite-links/${token}`)).json();
    expect(info).toMatchObject({ workspaceId: ws, workspaceName: 'Link Target WS', role: 'editor', invitedByName: 'lnk_owner user', alreadyMember: false });

    const acc = await joiner.ctx.post(`/api/invite-links/${token}/accept`);
    expect(acc.status()).toBe(200);
    expect((await members(owner.ctx, ws)).find(m => m.userId._id === joiner.id)?.role).toBe('editor');

    // Already a member: 200, role unchanged, multi-use count not spent.
    const again = await joiner.ctx.post(`/api/invite-links/${token}/accept`);
    expect(again.status()).toBe(200);
    expect(await again.json()).toMatchObject({ alreadyMember: true, role: 'editor' });
    expect((await (await joiner.ctx.get(`/api/invite-links/${token}`)).json()).alreadyMember).toBe(true);
    expect((await (await owner.ctx.get(`/api/workspaces/${ws}/invite-links`)).json())[0].useCount).toBe(1);
  });

  test('an owner link makes an owner', async () => {
    const owner = await makeUser('lnk_o2');
    const joiner = await makeUser('lnk_j2');
    const ws = await makeWorkspace(owner.ctx);
    const { token } = await createLink(owner.ctx, ws, { role: 'owner' });
    expect((await joiner.ctx.post(`/api/invite-links/${token}/accept`)).ok()).toBeTruthy();
    expect((await members(owner.ctx, ws)).find(m => m.userId._id === joiner.id)?.role).toBe('owner');
  });

  test('single-use: the second accept is 410, also when two accept at once', async () => {
    const owner = await makeUser('su_owner');
    const a = await makeUser('su_a');
    const b = await makeUser('su_b');
    const c = await makeUser('su_c');
    const ws = await makeWorkspace(owner.ctx);

    const one = await createLink(owner.ctx, ws, { singleUse: true });
    expect((await a.ctx.post(`/api/invite-links/${one.token}/accept`)).status()).toBe(200);
    const second = await b.ctx.post(`/api/invite-links/${one.token}/accept`);
    expect(second.status()).toBe(410);
    expect((await second.json()).message).toMatch(/already used/i);
    expect((await b.ctx.get(`/api/invite-links/${one.token}`)).status()).toBe(410);
    expect(await (await owner.ctx.get(`/api/workspaces/${ws}/invite-links`)).json()).toHaveLength(0);

    const race = await createLink(owner.ctx, ws, { singleUse: true });
    const results = await Promise.all([b, c].map(u => u.ctx.post(`/api/invite-links/${race.token}/accept`)));
    expect(results.map(r => r.status()).sort()).toEqual([200, 410]);
    expect((await members(owner.ctx, ws)).length).toBe(3); // owner, a, and exactly one of b / c
  });

  test('expired link answers 410 (expiry forced in the SQLite file)', async () => {
    const dbPath = process.env.REQSPACE_E2E_DB_PATH;
    test.skip(!dbPath || !fs.existsSync(dbPath) || (process.env.DB_TYPE || 'sqlite') !== 'sqlite', 'needs the e2e SQLite file');
    const owner = await makeUser('exp_owner');
    const joiner = await makeUser('exp_joiner');
    const ws = await makeWorkspace(owner.ctx);
    const { link, token } = await createLink(owner.ctx, ws, { expiresIn: '1d' });
    expect(new Date(link.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);

    const Database = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'better-sqlite3'));
    const db = new Database(dbPath!);
    try { db.prepare('UPDATE workspace_invite_links SET expiresAt = ? WHERE id = ?').run('2000-01-01 00:00:00.000 +00:00', link.id); }
    finally { db.close(); }

    const info = await joiner.ctx.get(`/api/invite-links/${token}`);
    expect(info.status()).toBe(410);
    expect((await info.json()).message).toMatch(/expired/i);
    expect((await joiner.ctx.post(`/api/invite-links/${token}/accept`)).status()).toBe(410);
    expect(await (await owner.ctx.get(`/api/workspaces/${ws}/invite-links`)).json()).toHaveLength(0);
  });

  test('revoked link answers 410; unknown token 404; revoking twice 404', async () => {
    const owner = await makeUser('rv_owner');
    const joiner = await makeUser('rv_joiner');
    const ws = await makeWorkspace(owner.ctx);
    const { link, token } = await createLink(owner.ctx, ws);
    expect((await owner.ctx.delete(`/api/workspaces/${ws}/invite-links/${link.id}`)).ok()).toBeTruthy();
    const res = await joiner.ctx.post(`/api/invite-links/${token}/accept`);
    expect(res.status()).toBe(410);
    expect((await res.json()).message).toMatch(/revoked/i);
    expect((await owner.ctx.delete(`/api/workspaces/${ws}/invite-links/${link.id}`)).status()).toBe(404);
    expect((await joiner.ctx.get('/api/invite-links/' + 'x'.repeat(43))).status()).toBe(404);
    expect((await joiner.ctx.get('/api/invite-links/short')).status()).toBe(404);
  });

  test('only owners manage links; input is validated; anonymous is 401', async () => {
    const owner = await makeUser('perm_owner');
    const editor = await makeUser('perm_editor');
    const ws = await makeWorkspace(owner.ctx);
    await owner.ctx.post(`/api/workspaces/${ws}/members`, { data: { email: editor.email, role: 'editor' } });
    await editor.ctx.get('/api/workspaces');
    const { link } = await createLink(owner.ctx, ws);

    const body = { role: 'viewer', singleUse: true, expiresIn: '1h' };
    expect((await editor.ctx.post(`/api/workspaces/${ws}/invite-links`, { data: body })).status()).toBe(403);
    expect((await editor.ctx.get(`/api/workspaces/${ws}/invite-links`)).status()).toBe(403);
    expect((await editor.ctx.delete(`/api/workspaces/${ws}/invite-links/${link.id}`)).status()).toBe(403);

    for (const bad of [{ ...body, role: 'admin' }, { ...body, expiresIn: '7d' }, { ...body, singleUse: 'yes' }, { role: 'viewer' }, { ...body, extra: 1 }]) {
      expect((await owner.ctx.post(`/api/workspaces/${ws}/invite-links`, { data: bad })).status()).toBe(400);
    }
    // A link of another workspace cannot be revoked through this one.
    const otherWs = await makeWorkspace(owner.ctx);
    expect((await owner.ctx.delete(`/api/workspaces/${otherWs}/invite-links/${link.id}`)).status()).toBe(404);

    const anon = await newCtx();
    expect((await anon.get('/api/invite-links/' + 'a'.repeat(43))).status()).toBe(401);
  });
});

test.describe('invite links UI', () => {
  test('owner creates a link in the tab; a signed-out user logs in, joins, and a used one-time link shows the message', async ({ page, browser }) => {
    await registerUser(page, 'ui_lnk_owner');
    const wsId = await activeWorkspaceId(page);
    await openSettingsTab(page, 'workspace-links-tab');
    await expect(page.getByTestId('invite-links-empty')).toBeVisible();
    await page.getByTestId('invite-link-role').selectOption('editor');
    await page.getByTestId('invite-link-create-btn').click();
    const url = await page.getByTestId('invite-link-url').inputValue();
    expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByTestId('invite-link-copy-btn')).toBeFocused();
    await page.getByTestId('invite-link-dismiss-btn').click();
    await expect(page.getByTestId('invite-link-result')).toBeHidden();
    const row = page.getByTestId('invite-link-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Editor');
    await expect(row).toContainText('One-time');
    await expect(row).toContainText('0 / 1');

    // Second user, signed out: the invite URL goes to login and comes back.
    const joiner = await makeUser('ui_lnk_joiner');
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(url);
    await expect(page2).toHaveURL(/\/login$/);
    await page2.getByTestId('login-email').fill(joiner.email);
    await page2.getByTestId('login-password').fill(PASSWORD);
    await page2.getByTestId('login-submit').click();
    await expect(page2).toHaveURL(/\/invite\//);
    await expect(page2.getByTestId('invite-title')).toHaveText(/ui_lnk_owner|Test User/);
    await expect(page2.getByTestId('invite-title')).toContainText('as Editor');
    await page2.getByTestId('invite-join-btn').click();
    await expect(page2).toHaveURL(/\/$/);
    await expect(page2.getByTestId('workspace-select')).toHaveAttribute('data-value', wsId);

    // The one-time link is spent.
    const third = await makeUser('ui_lnk_third');
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    await loginUi(page3, third.email);
    await page3.goto(url);
    await expect(page3.getByTestId('invite-error')).toContainText('This invite was already used');

    // Owner revokes from the list (the spent one is gone already; make a new one and revoke it).
    await page.getByTestId('invite-link-create-btn').click();
    await page.getByTestId('invite-link-dismiss-btn').click();
    await page.getByTestId('invite-link-revoke-btn').click();
    await page.getByTestId('confirm-btn').click();
    await expect(page.getByTestId('invite-links-empty')).toBeVisible();
    await ctx2.close();
    await ctx3.close();
  });

  test('error states on the invite page: unknown, revoked', async ({ page }) => {
    const owner = await makeUser('pg_owner');
    const ws = await makeWorkspace(owner.ctx);
    const { link, token } = await createLink(owner.ctx, ws);
    await owner.ctx.delete(`/api/workspaces/${ws}/invite-links/${link.id}`);
    await registerUser(page, 'pg_visitor');
    await page.goto('/invite/' + 'z'.repeat(43));
    await expect(page.getByTestId('invite-error')).toContainText('Invite not found');
    await page.goto('/invite/' + token);
    await expect(page.getByTestId('invite-error')).toContainText('This invite was revoked');
    await page.getByTestId('invite-home-btn').click();
    await expect(page).toHaveURL(/\/$/);
  });
});

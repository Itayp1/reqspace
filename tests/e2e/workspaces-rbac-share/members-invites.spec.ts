import { test, expect, API_URL, request as playwrightRequest } from '../fixtures';
import { registerUser, apiAs, apiAsAdmin, activeWorkspaceId, selectWorkspace, expectWorkspaceListed } from '../helpers';
import { makeUser, makeWorkspace, members, openSettingsTab } from './invite-helpers';

test.describe('email validation, owner role, revoke', () => {
  // 4xx answers (409 last owner, 400) are the point of several tests; the browser reports 401/403 as failed API calls.
  test.use({ allowFpErrors: [/server-auth|status code 40[13]/] });

  test('invalid email shows an inline error and sends nothing; a valid one becomes a pending invite', async ({ page }) => {
    await registerUser(page, 'inv_owner');
    await openSettingsTab(page, 'workspace-members-tab');
    let posts = 0;
    page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/members')) posts++; });

    await page.getByTestId('user-autocomplete-input').fill('not-an-email');
    await page.getByTestId('workspace-invite-btn').click();
    const err = page.getByTestId('workspace-invite-email-error');
    await expect(err).toHaveText('Enter a valid email address, for example name@example.com.');
    await expect(page.getByTestId('user-autocomplete-input')).toHaveAttribute('aria-invalid', 'true');
    expect(posts).toBe(0);

    const email = `pending_${Date.now()}@example.com`;
    await page.getByTestId('user-autocomplete-input').fill(email);
    await expect(err).toBeHidden();
    await page.getByTestId('workspace-invite-btn').click();
    await expect(page.getByTestId('invite-email').filter({ hasText: email })).toBeVisible();
    await expect(page.getByTestId('invite-row')).toContainText('Viewer · pending');
  });

  test('server rejects a malformed email with 400', async () => {
    const owner = await makeUser('inv_val');
    const ws = await makeWorkspace(owner.ctx);
    const res = await owner.ctx.post(`/api/workspaces/${ws}/members`, { data: { email: 'nope', role: 'viewer' } });
    expect(res.status()).toBe(400);
  });

  test('an invited owner joins as owner; promote a member; the last owner cannot be demoted', async () => {
    const owner = await makeUser('own_a');
    const second = await makeUser('own_b');
    const third = await makeUser('own_c');
    const ws = await makeWorkspace(owner.ctx);

    // Invite as owner (email is trimmed and lower-cased by the server); redeemed on the invitee's next request.
    const inv = await owner.ctx.post(`/api/workspaces/${ws}/members`, { data: { email: `  ${second.email.toUpperCase()} `, role: 'owner' } });
    expect(inv.status()).toBe(201);
    expect((await second.ctx.get('/api/workspaces')).ok()).toBeTruthy();
    expect((await members(owner.ctx, ws)).find(m => m.userId._id === second.id)?.role).toBe('owner');

    // Promote a viewer to owner.
    expect((await owner.ctx.post(`/api/workspaces/${ws}/members`, { data: { email: third.email, role: 'viewer' } })).ok()).toBeTruthy();
    await third.ctx.get('/api/workspaces');
    const promote = await owner.ctx.put(`/api/workspaces/${ws}/members/${third.id}`, { data: { role: 'owner' } });
    expect(promote.ok()).toBeTruthy();
    expect((await members(owner.ctx, ws)).filter(m => m.role === 'owner')).toHaveLength(3);

    // Demote down to one owner, then the last one is protected.
    expect((await owner.ctx.put(`/api/workspaces/${ws}/members/${third.id}`, { data: { role: 'viewer' } })).ok()).toBeTruthy();
    expect((await owner.ctx.put(`/api/workspaces/${ws}/members/${second.id}`, { data: { role: 'viewer' } })).ok()).toBeTruthy();
    const last = await owner.ctx.put(`/api/workspaces/${ws}/members/${owner.id}`, { data: { role: 'editor' } });
    expect(last.status()).toBe(409);
    expect((await last.json()).message).toMatch(/last owner/i);
  });

  test('UI: owner rows get a role select only when there is more than one owner', async ({ page }) => {
    await registerUser(page, 'ui_owner');
    const ws = await activeWorkspaceId(page);
    const other = await makeUser('ui_owner2');
    await page.request.post(`/api/workspaces/${ws}/members`, { data: { email: other.email, role: 'owner' } });
    await openSettingsTab(page, 'workspace-members-tab');
    await expect(page.getByTestId('member-role-text')).toHaveCount(1);
    await other.ctx.get('/api/workspaces'); // redeems the invite
    await page.getByTestId('close-workspace-modal').click();
    await openSettingsTab(page, 'workspace-members-tab');
    await expect(page.getByTestId('member-row')).toHaveCount(2);
    await expect(page.getByTestId('member-role-select')).toHaveCount(2);
    await expect(page.getByTestId('member-role-select').first().locator('option')).toHaveText(['Viewer', 'Editor', 'Owner']);
  });

  test('revoking an email invite asks for confirmation and the invitee does not join', async ({ page }) => {
    await registerUser(page, 'rev_owner');
    const ws = await activeWorkspaceId(page);
    const invitee = await makeUser('rev_invitee');
    await openSettingsTab(page, 'workspace-members-tab');
    await page.getByTestId('user-autocomplete-input').fill(invitee.email);
    await page.getByTestId('workspace-invite-btn').click();
    const row = page.getByTestId('invite-row').filter({ hasText: invitee.email });
    await expect(row).toBeVisible();

    await row.getByTestId('invite-cancel-btn').click();
    await page.getByTestId('confirm-cancel-btn').click(); // cancelling keeps the invite
    await expect(row).toBeVisible();
    await row.getByTestId('invite-cancel-btn').click();
    await page.getByTestId('confirm-btn').click();
    await expect(page.getByTestId('invite-row')).toHaveCount(0);

    const list = await (await invitee.ctx.get('/api/workspaces')).json();
    expect(list.some((w: any) => w._id === ws)).toBe(false);
  });
});

test.describe('Workspace Management', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('removing a member immediately revokes their access', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const ownerEmail = `owner_${Date.now()}@example.com`;
    
    // Register owner
    await ownerPage.goto('/register');
    await ownerPage.fill('[data-testid="register-name"]', 'Owner User');
    await ownerPage.fill('[data-testid="register-email"]', ownerEmail);
    await ownerPage.fill('[data-testid="register-password"]', 'password123');
    await ownerPage.click('[data-testid="register-submit"]');
    await expect(ownerPage).toHaveURL(/.*\/$/);
    
    // Owner creates workspace
    const wsName = `Shared Workspace ${Date.now()}`;
    await ownerPage.click('[data-testid="new-workspace-btn"]');
    await ownerPage.getByTestId('prompt-input').fill(wsName);
    await ownerPage.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(ownerPage, wsName);
    
    const workspaceId = await activeWorkspaceId(ownerPage);
    await selectWorkspace(ownerPage, workspaceId);

    // Register member
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    const memberEmail = `member_${Date.now()}@example.com`;
    
    await memberPage.goto('/register');
    await memberPage.fill('[data-testid="register-name"]', 'Member User');
    await memberPage.fill('[data-testid="register-email"]', memberEmail);
    await memberPage.fill('[data-testid="register-password"]', 'password123');
    await memberPage.click('[data-testid="register-submit"]');
    await expect(memberPage).toHaveURL(/.*\/$/);
    
    // Owner invites member
    await ownerPage.click('[data-testid="workspace-settings-btn"]');
    await ownerPage.getByTestId('workspace-members-tab').click();
    await ownerPage.fill('[data-testid="user-autocomplete-input"]', memberEmail);
    await ownerPage.selectOption('[data-testid="workspace-invite-role"]', 'editor');
    await ownerPage.click('[data-testid="workspace-invite-btn"]');
    await expect(ownerPage.getByTestId('invite-email').filter({ hasText: memberEmail })).toBeVisible();
    
    // Member refreshes and switches to workspace
    await memberPage.reload();
    await expectWorkspaceListed(memberPage, wsName);
    await selectWorkspace(memberPage, workspaceId);
    
    // Verify member has access
    await expect(memberPage.locator('[data-testid="workspace-select"]')).toHaveAttribute('data-value', workspaceId);
    
    // Verify member has access via API first
    const resBefore = await memberPage.evaluate(async (id) => {
        const baseUrl = window.location.origin;
        const response = await fetch(`${baseUrl}/api/workspaces/${id}`, { headers: {} });
        return { status: response.status, ok: response.ok };
    }, workspaceId);
    expect(resBefore.ok).toBe(true);
    expect(resBefore.status).toBe(200);

    // Owner removes member
    const memberRow = ownerPage.locator('[data-testid="member-row"]').filter({ hasText: memberEmail });
    await expect(memberRow).toBeVisible();
    await memberRow.locator('[data-testid="member-remove-btn"]').click();
    const removed = ownerPage.waitForResponse(
      (r) => r.url().includes('/members/') && r.request().method() === 'DELETE' && r.ok(),
    );
    await ownerPage.getByTestId('confirm-btn').click();
    await removed;
    await expect(memberRow).toHaveCount(0);

    // Member should lose access: verify via API call
    const res = await memberPage.evaluate(async (id) => {
        const baseUrl = window.location.origin;
        const response = await fetch(`${baseUrl}/api/workspaces/${id}`);
        return { status: response.status, ok: response.ok };
    }, workspaceId);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    
    await ownerContext.close();
    await memberContext.close();
  });
});

test.describe('App shell', () => {
  test('an owner changes a member\'s role from Workspace Settings and it takes effect', async ({ page, browser }) => {
    const ts = Date.now();
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    const memberEmail = await registerUser(memberPage, 'shell_member', 'Role Member');
    await memberCtx.close();

    await registerUser(page, 'shell_owner', 'Role Owner');
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(`Roles WS ${ts}`);
    await page.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(page, `Roles WS ${ts}`);
    await expect(page.getByTestId('workspace-select')).toHaveText(`Roles WS ${ts}`);
    const wsId = await activeWorkspaceId(page);

    await page.getByTestId('workspace-settings-btn').click();
    await page.getByTestId('workspace-members-tab').click();
    await page.getByTestId('user-autocomplete-input').fill(memberEmail);
    await page.getByTestId('workspace-invite-role').selectOption('viewer');
    await page.getByTestId('workspace-invite-btn').click();
    await expect(page.getByTestId('invite-email').filter({ hasText: memberEmail })).toBeVisible();

    // The member's first request redeems the pending invite; the open members list picks it up live.
    const memberApi = await apiAs(memberEmail);
    const roleOf = async () => ((await (await memberApi.get('/api/workspaces')).json()) as any[]).find(w => w._id === wsId)?.myRole;
    expect(await roleOf()).toBe('viewer');
    const row = page.getByTestId('member-row').filter({ hasText: memberEmail });
    await expect(row.getByTestId('member-role-select')).toHaveValue('viewer');

    const put = page.waitForResponse(r => r.url().includes('/members/') && r.request().method() === 'PUT');
    await row.getByTestId('member-role-select').selectOption('editor');
    expect((await put).status()).toBe(200);
    await expect(row.getByTestId('member-role-select')).toHaveValue('editor');
    await expect.poll(roleOf).toBe('editor');

    // And the new role really grants editor rights.
    const created = await memberApi.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Made by member' } });
    expect(created.status()).toBe(201);
    await memberApi.dispose();
  });
});

/**
 * USER-DIRECTORY: /users/search returned up to 10 users from the whole system to any signed-in
 * user (2-letter prefix of name or email), so running aa, ab, ... harvested every account.
 * Search must only return people who share a workspace with the caller, and an invite must
 * not reveal whether the email has an account: every invite is pending, with the same reply.
 */
async function register(prefix: string) {
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  const reg = await anon.post('/api/auth/register', { data: { name: `Dir ${prefix}`, email, password: 'password123' } });
  expect(reg.status(), await reg.text()).toBe(201);
  await anon.dispose();
  return email;
}

const emailsOf = async (res: any) => ((await res.json()) as Array<{ email: string }>).map(u => u.email);

test('search hides strangers, and an invite does not reveal whether the account exists', async () => {
  const ownerEmail = await register('dirowner');
  const strangerEmail = await register('dirstranger');
  const owner = await apiAs(ownerEmail);

  // A stranger is not found by a prefix or by the full email.
  expect(await emailsOf(await owner.get(`/api/users/search?q=${encodeURIComponent(strangerEmail.slice(0, 11))}`))).not.toContain(strangerEmail);
  expect(await emailsOf(await owner.get(`/api/users/search?q=${encodeURIComponent(strangerEmail)}`))).not.toContain(strangerEmail);

  const ws = await (await owner.post('/api/workspaces', { data: { name: `Dir WS ${Date.now()}` } })).json();
  const ghostEmail = `dirghost_${Date.now()}@example.com`;
  const inviteExisting = await owner.post(`/api/workspaces/${ws._id}/members`, { data: { email: strangerEmail, role: 'editor' } });
  const inviteGhost = await owner.post(`/api/workspaces/${ws._id}/members`, { data: { email: ghostEmail, role: 'viewer' } });
  expect(inviteExisting.status()).toBe(inviteGhost.status());
  // Same reply apart from echoing back what was sent.
  const [a, b] = [await inviteExisting.json(), await inviteGhost.json()];
  expect(a).toEqual({ message: b.message, invite: { email: strangerEmail, role: 'editor' } });
  expect(b.invite).toEqual({ email: ghostEmail, role: 'viewer' });

  // Both show only as pending invites until the invitee next uses the app.
  let detail = await (await owner.get(`/api/workspaces/${ws._id}`)).json();
  expect(detail.members.map((m: any) => m.userId?.email)).not.toContain(strangerEmail);
  expect(detail.invites.map((i: any) => i.email).sort()).toEqual([ghostEmail, strangerEmail].sort());

  // The existing user joins on their next request; the other one on registering.
  const stranger = await apiAs(strangerEmail);
  expect((await stranger.get('/api/workspaces')).ok()).toBeTruthy();
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  expect((await anon.post('/api/auth/register', { data: { name: 'Ghost', email: ghostEmail, password: 'password123' } })).status()).toBe(201);
  expect((await anon.get('/api/workspaces')).ok()).toBeTruthy();
  await anon.dispose();

  detail = await (await owner.get(`/api/workspaces/${ws._id}`)).json();
  const members = detail.members.map((m: any) => [m.userId?.email, m.role]);
  expect(members).toContainEqual([strangerEmail, 'editor']);
  expect(members).toContainEqual([ghostEmail, 'viewer']);
  expect(detail.invites).toEqual([]);

  // Now that they share a workspace, the former stranger is found by prefix.
  expect(await emailsOf(await owner.get(`/api/users/search?q=${encodeURIComponent(strangerEmail.slice(0, 11))}`))).toContain(strangerEmail);
});

/**
 * USER-SEARCH: typing a user's full email into the member invite box returned no suggestions on
 * Postgres (LIKE with ESCAPE). A freshly registered user must be found by their full email.
 */
test('a registered user is found by typing their full email', async () => {
  const email = `Search_${Date.now()}_User@example.com`; // typed in mixed case; registration stores it lowercased
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  const reg = await anon.post('/api/auth/register', { data: { name: 'Search Target', email, password: 'password123' } });
  expect(reg.status(), await reg.text()).toBe(201);
  await anon.dispose();

  const admin = await apiAsAdmin();
  const res = await admin.get(`/api/users/search?q=${encodeURIComponent(email)}`);
  expect(res.status()).toBe(200);
  const found = await res.json() as Array<{ email: string }>;
  expect(found.map(u => u.email)).toContain(email.toLowerCase());
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

test.describe('Leaving a workspace', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('[B6.3] an editor or viewer can leave a workspace on their own', async () => {
    const owner = await makeUser('b63o');
    const editor = await makeUser('b63e');
    const viewer = await makeUser('b63v');
    const wsId = await makeWorkspace(owner.ctx);
    await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: editor.email, role: 'editor' } });
    await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewer.email, role: 'viewer' } });
    expect((await editor.ctx.delete(`/api/workspaces/${wsId}/members/${editor.id}`)).status()).toBe(200);
    expect((await viewer.ctx.delete(`/api/workspaces/${wsId}/members/${viewer.id}`)).status()).toBe(200);
  });
});

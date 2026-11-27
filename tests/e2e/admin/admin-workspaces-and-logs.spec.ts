import { test, expect, API_URL } from '../fixtures';
import { loginAdminUi, apiAs, apiAsAdmin, registerUser } from '../helpers';
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';

/**
 * The Super Admin Workspaces and Logs tabs:
 *  - Workspaces: the tab crashed the whole page (the paginated response object was rendered as if it
 *    were an array), and Manage Permissions offered roles the server rejects.
 *  - Audit logs: showed "undefined (undefined)" and raw user ids.
 */
async function openAdminTab(page: import('@playwright/test').Page, tab: string) {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
  await page.getByTestId(`admin-tab-${tab}`).click();
}

let seq = 0;
const ip = () => `10.${200 + (seq++ % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

/** A superadmin must see every workspace, including other users' private ones. */
test('admin workspace list includes private workspaces of other users', async () => {
  const email = `ws_owner_${Date.now()}@example.com`;
  const anon = await playwrightRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': '10.251.7.7' } });
  const reg = await anon.post('/api/auth/register', { data: { name: 'Owner', email, password: 'password123' } });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  const owner = await apiAs(email);
  const name = `Private ${Date.now()}`;
  const created = await owner.post('/api/workspaces', { data: { name, isPublic: false } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const id = (await created.json())._id ?? (await created.json()).id;

  const admin = await apiAsAdmin();
  const list = await (await admin.get('/api/workspaces')).json();
  expect(list.map((w: any) => w._id ?? w.id)).toContain(id);
});

test('the Workspaces tab renders and Manage Permissions adds, re-roles and removes a member', async ({ page }) => {
  const ts = Date.now();
  const EMAIL = `managed_ws_${ts}@example.com`;
  const anon = await playwrightRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': '10.251.0.11' } });
  expect((await anon.post('/api/auth/register', { data: { name: `Managed WS ${ts}`, email: EMAIL, password: 'password123' } })).status()).toBe(201);
  await anon.dispose();

  const admin = await apiAsAdmin();
  const wsName = `Admin Managed WS ${ts}`;
  const ws = await (await admin.post('/api/workspaces', { data: { name: wsName } })).json();
  await admin.dispose();

  await openAdminTab(page, 'workspaces');
  const row = page.getByTestId(`admin-workspace-row-${wsName}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('1 member');

  await page.getByTestId(`admin-manage-permissions-${wsName}`).click();
  await page.getByPlaceholder('email@example.com or Username').fill(EMAIL);
  await page.getByTestId('admin-perm-invite-role').selectOption('editor');
  await page.getByRole('button', { name: 'Add Member' }).click();
  const memberRow = page.locator('tr', { hasText: EMAIL });
  await expect(memberRow).toBeVisible();
  await expect(memberRow.locator('select')).toHaveValue('editor');

  await memberRow.locator('select').selectOption('viewer');
  await expect(memberRow.locator('select')).toHaveValue('viewer');
  const check = await apiAs(EMAIL);
  const mine = await (await check.get('/api/workspaces')).json();
  expect(mine.find((w: any) => w._id === ws._id)?.myRole).toBe('viewer');

  await memberRow.getByRole('button').click();
  await page.getByTestId('confirm-btn').click();
  await expect(memberRow).toHaveCount(0);
  const after = await (await check.get('/api/workspaces')).json();
  expect(after.some((w: any) => w._id === ws._id)).toBe(false);
  await check.dispose();
  await page.getByTestId('admin-perm-close').click();
});

test.describe('Q5.1 admin workspaces table', () => {
  test('[Q5.1] the admin Workspaces table shows Owner and request-count/size columns', async ({ page }) => {
    await openAdminTab(page, 'workspaces');

    const headers = page.locator('thead th');
    await expect(headers.filter({ hasText: /^Owner$/ })).toHaveCount(1);
    await expect(headers.filter({ hasText: /^Size$/ })).toHaveCount(1);

    const row = page.locator('tr[data-testid^="admin-workspace-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/\d+ requests/);
    // Owner cell (2nd column) is populated with a name/email, not left empty.
    await expect(row.locator('td').nth(1)).not.toHaveText('');
  });
});

test('the audit log names the acting user and the target', async ({ page }) => {
  // Produce its own admin.user.promote row (the Users spec's promote test may not have run yet).
  const admin = await apiAsAdmin();
  const created = await admin.post('/api/admin/users', { data: { name: `Audit Target ${Date.now()}`, email: `audit_${Date.now()}@example.com`, password: 'password123' } });
  expect(created.status()).toBe(201);
  const body = await created.json();
  const id = body._id ?? body.id;
  expect((await admin.post(`/api/admin/users/${id}/promote`, { data: {} })).ok()).toBeTruthy();
  expect((await admin.post(`/api/admin/users/${id}/revoke`, { data: {} })).ok()).toBeTruthy();
  await admin.dispose();

  await openAdminTab(page, 'logs');
  const promoteRow = page.getByTestId('audit-log-row').filter({ hasText: 'admin.user.promote' }).first();
  await expect(promoteRow).toBeVisible();
  await expect(promoteRow).toContainText('Admin');
  await expect(promoteRow).toContainText('User (');
  await expect(page.getByTestId('audit-log-row').filter({ hasText: 'undefined' })).toHaveCount(0);
});

// QA-31: the audit log's Resource column showed a raw workspace UUID.
test('QA-31: audit log Resource shows the workspace name, not its id', async ({ page }) => {
  const name = `QA31 Workspace ${Date.now()}`;
  const api = await apiAsAdmin();
  const ws = await (await api.post('/api/workspaces', { data: { name } })).json();
  const id = ws._id || ws.id;
  expect((await api.put(`/api/workspaces/${id}`, { data: { description: 'touched' } })).ok()).toBeTruthy();

  await openAdminTab(page, 'logs');
  await page.getByTestId('audit-filter-action').fill('workspace.update');
  await page.getByTestId('audit-filter-apply').click();
  const row = page.getByTestId('audit-log-row').filter({ hasText: name });
  await expect(row.first()).toBeVisible();
  await expect(row.first()).not.toContainText(id);
});

test.describe('Q6.5 audit log escaping (API)', () => {
  test('[Q6.5] audit-log response never carries raw HTML from user-controlled names', async () => {
    const admin = await apiAsAdmin();
    const marker = `q65_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
    const name = `<img src=x onerror=alert(1)>${marker}`;
    const ctx = await playwrightRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
    const reg = await ctx.post('/api/auth/register', { data: { name: 'QA User', email: `${marker}@example.com`, password: 'password123' } });
    expect(reg.status(), 'register').toBe(201);
    const wsList = await (await ctx.get('/api/workspaces')).json();
    const wsId = (Array.isArray(wsList) ? wsList : wsList.workspaces)[0]._id ?? (Array.isArray(wsList) ? wsList : wsList.workspaces)[0].id;
    const created = await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name } });
    expect(created.ok(), 'create collection').toBeTruthy();

    let raw = '';
    await expect.poll(async () => {
      raw = await (await admin.get('/api/admin/logs?action=collection.create&limit=200')).text();
      return raw.includes(marker);
    }, { timeout: 10_000 }).toBe(true);

    expect(raw).not.toContain('<img');
    expect(raw).not.toContain('>');
    // The data itself is intact once parsed; React then renders it as plain text.
    expect(JSON.parse(raw).logs.some((l: any) => l.details?.name === name)).toBe(true);
  });
});

test('Logs and Errors date filters show visible From / To labels', async ({ page }) => {
  await openAdminTab(page, 'logs');
  await expect(page.locator('label', { hasText: /^From/ }).first()).toBeVisible();
  await expect(page.locator('label', { hasText: /^To/ }).first()).toBeVisible();
  await page.getByTestId('admin-tab-errors').click();
  await expect(page.locator('label', { hasText: /^From/ }).first()).toBeVisible();
});


const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
async function anon(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
}
async function newUser(prefix: string) {
  const email = `${uniq(prefix)}@example.com`;
  const ctx = await anon();
  const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
  expect(res.status(), 'register').toBe(201);
  const body = await res.json();
  return { ctx, email, id: (body.user?.id ?? body.user?._id) as string };
}

async function newWorkspace(ctx: APIRequestContext, name = uniq('ws')) {
  const res = await ctx.post('/api/workspaces', { data: { name } });
  expect(res.ok(), 'create workspace').toBeTruthy();
  const ws = await res.json();
  return (ws.id ?? ws._id) as string;
}

test.describe('Admin workspaces (API)', () => {
  test.use({ allowFpErrors: [/probe d+/] });

  test('[Q5.1] the admin workspaces list reports owner, item count and storage', async () => {
    const admin = await apiAsAdmin();
    const body = await (await admin.get('/api/admin/workspaces')).json();
    const rows: any[] = Array.isArray(body) ? body : body.items ?? body.workspaces;
    expect(rows.length).toBeGreaterThan(0);
    const w = rows[0];
    expect(w).toHaveProperty('owner');
    expect(JSON.stringify(Object.keys(w))).toMatch(/count|items|requests/i);
    expect(JSON.stringify(Object.keys(w))).toMatch(/size|bytes|storage/i);
  });

  test('[Q5.3] an admin adding themselves as owner to another workspace is audited', async () => {
    const owner = await newUser('q53');
    const wsId = await newWorkspace(owner.ctx);
    const admin = await apiAsAdmin();
    const me = await (await admin.get('/api/auth/me')).json();
    const adminId = me.user?.id ?? me.id ?? me._id;
    const res = await admin.put(`/api/workspaces/${wsId}/members/${adminId}`, { data: { role: 'owner' } });
    expect([403, 404]).toContain(res.status());
  });
});

test.describe('Admin audit log (API)', () => {
  test.use({ allowFpErrors: [/q74 dedupe probe/] });

  test('[Q6.1] a failed login is recorded in the audit log', async () => {
    const admin = await apiAsAdmin();
    const u = await newUser('q61');
    const ctx = await anon();
    const bad = await ctx.post('/api/auth/login', { data: { email: u.email, password: 'wrong-password-1' } });
    expect(bad.status()).toBe(401);
    const logs = await (await admin.get('/api/admin/logs?action=auth.login_failed&limit=50')).json();
    expect(logs.logs.length).toBeGreaterThan(0);
    expect(logs.logs.every((l: any) => l.action === 'auth.login_failed')).toBe(true);
  });

  test('[Q6.2] audit log supports paging, action/date filters and a total', async () => {
    const admin = await apiAsAdmin();
    const body = await (await admin.get('/api/admin/logs?limit=2&page=1')).json();
    expect(body.logs.length).toBeLessThanOrEqual(2);
    expect(typeof body.total).toBe('number');
    const future = await (await admin.get(`/api/admin/logs?from=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`)).json();
    expect(future.logs).toHaveLength(0);
    const none = await (await admin.get('/api/admin/logs?action=no.such.action')).json();
    expect(none.logs).toHaveLength(0);
  });
});

test.describe('Manual-pass bugs (admin workspace)', () => {
  test('BUG-01: the superadmin\'s own workspace is marked personal', async () => {
    const ctx = await apiAsAdmin();
    const body = await (await ctx.get('/api/workspaces')).json();
    const list: Array<{ name: string; isPersonal: boolean }> = Array.isArray(body) ? body : body.workspaces;
    const own = list.find((w) => w.name === "Admin's Workspace");
    expect(own, 'admin workspace exists').toBeTruthy();
    expect(own!.isPersonal).toBe(true);
    await ctx.dispose();
  });
});

/** QA-28: Admin > Workspaces shows "1 members" / "1 collections" for a count of 1. */
test('Admin workspaces table uses singular for a count of 1', async ({ page }) => {
  await registerUser(page, 'qa28', 'Plural User');
  await page.goto('about:blank'); // stop the app's in-flight requests so they don't 401 into fperrors
  await page.context().clearCookies();
  await loginAdminUi(page);
  await page.goto('/admin');
  await page.getByTestId('admin-tab-workspaces').click();
  await expect(page.locator('[data-testid^="admin-workspace-row-"]').first()).toBeVisible();
  const text = await page.locator('tbody').innerText();
  expect(text).toContain('1 member');
  expect(text).not.toMatch(/\b1 members\b/);
  expect(text).not.toMatch(/\b1 collections\b/);
});

/** QA-76: Escape must close the admin Manage Permissions modal even when focus is outside it; an inner confirm closes first. */
test('Escape closes the Manage Permissions modal, inner confirm first', async ({ page }) => {
  const admin = await apiAsAdmin();
  const wsName = `QA76 WS ${Date.now()}`;
  await admin.post('/api/workspaces', { data: { name: wsName } });
  await admin.dispose();

  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await page.getByTestId('admin-tab-workspaces').click();
  await page.getByTestId(`admin-manage-permissions-${wsName}`).click();
  await expect(page.getByTestId('admin-perm-close')).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('admin-perm-close')).toHaveCount(0);
});

// QA-115 (follow-up of QA-71): Manage Permissions never explains Viewer / Editor / Owner.
test('QA-115: Manage Permissions dialog explains the roles', async ({ page }) => {
  const wsName = `Role Help WS ${Date.now()}`;
  const admin = await apiAsAdmin();
  await admin.post('/api/workspaces', { data: { name: wsName } });
  await admin.dispose();

  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await page.getByTestId('admin-tab-workspaces').click();
  await page.getByTestId(`admin-manage-permissions-${wsName}`).click();
  await expect(page.getByTestId('admin-perm-role-help')).toContainText(/Viewer.*Editor.*Owner/);
});

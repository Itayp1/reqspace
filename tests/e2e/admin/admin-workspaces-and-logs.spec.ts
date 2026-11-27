import { test, expect, API_URL } from '../fixtures';
import { loginAdminUi, apiAs, apiAsAdmin } from '../helpers';
import { request as playwrightRequest } from '@playwright/test';

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

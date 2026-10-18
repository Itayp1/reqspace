import { test, expect, request as pwRequest } from './fixtures';
import { loginAdminUi, apiAs, apiAsAdmin, expectToast } from './helpers';
import { API_URL } from './fixtures';

/**
 * The Super Admin dashboard beyond login and one config field:
 *
 *  - Users: Make Admin / Revoke Admin / Suspend / Reactivate / Delete. None of
 *    these routes existed, so every button 404'd.
 *  - Workspaces: the tab crashed the whole page (the paginated response
 *    object was rendered as if it were an array), and Manage Permissions
 *    offered roles the server rejects.
 *  - Audit logs: showed "undefined (undefined)" and raw user ids.
 *  - Errors: the fperrors review screen — list, details, "Fixed".
 *  - Settings: SMTP and Google OAuth were silently dropped on save.
 */
test.describe('Admin management', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const NAME = `Managed ${ts}`;
  const EMAIL = `managed_${ts}@example.com`;

  async function openAdmin(page: import('@playwright/test').Page, tab: string) {
    await loginAdminUi(page);
    await page.getByTestId('admin-dashboard-link').click();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
    await page.getByTestId(`admin-tab-${tab}`).click();
  }

  test('set up a user to manage', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': '10.251.0.9' } });
    const res = await ctx.post('/api/auth/register', { data: { name: NAME, email: EMAIL, password: 'password123' } });
    expect(res.status()).toBe(201);
    await ctx.dispose();
  });

  test('Make Admin and Revoke Admin flip the super admin flag', async ({ page }) => {
    await openAdmin(page, 'users');
    const flag = page.getByTestId(`user-superadmin-${NAME}`);
    await expect(flag).toHaveAttribute('data-superadmin', 'false');

    await page.getByTestId(`user-promote-${NAME}`).click();
    await expectToast(page, 'success', 'super admin');
    await expect(flag).toHaveAttribute('data-superadmin', 'true');

    await page.getByTestId(`user-revoke-${NAME}`).click();
    await expect(flag).toHaveAttribute('data-superadmin', 'false');
  });

  test('Suspend locks the account out at once; Reactivate lets it back in', async ({ page }) => {
    const userApi = await apiAs(EMAIL);
    expect((await userApi.get('/api/auth/me')).status()).toBe(200);

    await openAdmin(page, 'users');
    await page.getByTestId(`user-suspend-${NAME}`).click();
    await expect(page.getByTestId(`user-status-${NAME}`)).toHaveText('Suspended');
    expect((await userApi.get('/api/auth/me')).status()).toBe(401);
    expect((await userApi.post('/api/auth/login', { data: { email: EMAIL, password: 'password123' } })).status()).toBe(403);

    await page.getByTestId(`user-suspend-${NAME}`).click();
    await expect(page.getByTestId(`user-status-${NAME}`)).toHaveText('Active');
    expect((await userApi.post('/api/auth/login', { data: { email: EMAIL, password: 'password123' } })).status()).toBe(200);
    await userApi.dispose();
  });

  test('the admin cannot revoke or suspend their own account', async ({ page }) => {
    await openAdmin(page, 'users');
    // The seeded admin's row, found by its email rather than its (non-unique) name.
    const me = page.locator('tr[data-testid^="user-row-"]').filter({ has: page.getByRole('cell', { name: 'admin', exact: true }) });
    await me.getByRole('button', { name: /Revoke Admin/ }).click();
    await expectToast(page, 'error', 'cannot revoke your own');
    await me.getByRole('button', { name: 'Suspend user' }).click();
    await expectToast(page, 'error', 'cannot suspend your own');
    await expect(me.locator('[data-superadmin]')).toHaveAttribute('data-superadmin', 'true');
  });

  test('the Workspaces tab renders and Manage Permissions adds, re-roles and removes a member', async ({ page }) => {
    const admin = await apiAsAdmin();
    const wsName = `Admin Managed WS ${ts}`;
    const ws = await (await admin.post('/api/workspaces', { data: { name: wsName } })).json();
    await admin.dispose();

    await openAdmin(page, 'workspaces');
    const row = page.getByTestId(`admin-workspace-row-${wsName}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('1 members');

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

  test('the audit log names the acting user and the target', async ({ page }) => {
    await openAdmin(page, 'logs');
    const promoteRow = page.getByTestId('audit-log-row').filter({ hasText: 'admin.user.promote' }).first();
    await expect(promoteRow).toBeVisible();
    await expect(promoteRow).toContainText('Admin');
    await expect(promoteRow).toContainText('User (');
    await expect(page.getByTestId('audit-log-row').filter({ hasText: 'undefined' })).toHaveCount(0);
  });

  test.describe('errors panel', () => {
    // This test reports a client fault on purpose to review it on screen.
    test.use({ allowFpErrors: [/admin-errors-panel-probe/] });

    test('lists a recorded fault, shows its details, and Fixed removes it', async ({ page, request }) => {
      const marker = `admin-errors-panel-probe-${ts}`;
      const res = await request.post(`${API_URL}/api/errors`, {
        data: { kind: 'window.error', message: marker, stack: `Error: ${marker}\n    at probe (probe.js:1:1)` },
      });
      expect(res.status()).toBe(204);

      await openAdmin(page, 'errors');
      await page.getByTestId('errors-search').fill(marker);
      await page.getByTestId('errors-search-btn').click();
      const row = page.getByTestId('error-row').filter({ hasText: marker });
      await expect(row).toHaveCount(1);
      await row.getByTestId('error-details-btn').click();
      await expect(page.getByTestId('error-occurrence').first()).toContainText('probe.js:1:1');

      await row.getByTestId('error-fixed-btn').click();
      await page.getByTestId('confirm-btn').click();
      await expectToast(page, 'success', 'Error removed');
      await expect(page.getByTestId('error-row').filter({ hasText: marker })).toHaveCount(0);
    });
  });

  test('SMTP and Google OAuth settings are saved; Test Connection reports a failure', async ({ page }) => {
    await openAdmin(page, 'settings');
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();

    const smtp = page.getByTestId('admin-smtp-enabled');
    if (!(await smtp.isChecked())) await smtp.check();
    await page.getByTestId('admin-smtp-host').fill('127.0.0.1');
    await page.getByTestId('admin-smtp-port').fill('1');
    await page.getByTestId('admin-smtp-from').fill(`noreply-${ts}@example.test`);

    const google = page.getByTestId('admin-google-enabled');
    if (!(await google.isChecked())) await google.check();
    await page.getByTestId('admin-google-client-id').fill(`client-${ts}.apps.example`);

    const save = page.waitForResponse(r => r.url().includes('/admin/config') && r.request().method() === 'PUT');
    await page.getByTestId('admin-save-config').click();
    expect((await save).status()).toBe(200);

    await page.getByTestId('admin-smtp-test').click();
    // 127.0.0.1 is a private target, so the guard rejects it before any connection is attempted.
    await expectToast(page, 'error', /SMTP connection failed|private network/i);

    await page.reload();
    await page.getByTestId('admin-tab-settings').click();
    await expect(page.getByTestId('admin-smtp-host')).toHaveValue('127.0.0.1');
    await expect(page.getByTestId('admin-smtp-from')).toHaveValue(`noreply-${ts}@example.test`);
    await expect(page.getByTestId('admin-google-client-id')).toHaveValue(`client-${ts}.apps.example`);

    // Leave Google OAuth off so the login page of later tests is unchanged.
    await page.getByTestId('admin-google-enabled').uncheck();
    await page.getByTestId('admin-smtp-enabled').uncheck();
    const revert = page.waitForResponse(r => r.url().includes('/admin/config') && r.request().method() === 'PUT');
    await page.getByTestId('admin-save-config').click();
    await revert;
  });

  test('Delete removes the user and their personal workspace', async ({ page }) => {
    await openAdmin(page, 'users');
    await expect(page.getByTestId(`user-row-${NAME}`)).toBeVisible();
    await page.getByTestId(`user-delete-${NAME}`).click();
    await page.getByTestId('confirm-btn').click();
    await expectToast(page, 'success', 'User deleted');
    await expect(page.getByTestId(`user-row-${NAME}`)).toHaveCount(0);

    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': '10.251.0.10' } });
    expect((await ctx.post('/api/auth/login', { data: { email: EMAIL, password: 'password123' } })).status()).toBe(401);
    await ctx.dispose();
  });
});

import { test, expect, request as pwRequest, API_URL } from '../fixtures';
import { loginAdminUi, apiAs, apiAsAdmin, expectToast } from '../helpers';

/**
 * The Super Admin Users tab and Add User modal (workspaces/logs, errors and settings live in sibling specs):
 * Make Admin / Revoke Admin / Suspend / Reactivate / Delete. None of these routes existed, so every button 404'd.
 */
async function openAdmin(page: import('@playwright/test').Page, tab: string) {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
  await page.getByTestId(`admin-tab-${tab}`).click();
}

// User lifecycle: each step needs the user created by the first one, and the delete must stay last.
test.describe('Admin management', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const NAME = `Managed ${ts}`;
  const EMAIL = `managed_${ts}@example.com`;

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
    // The list is paginated (50), so on a database shared with the whole suite the admin may not be on page 1.
    await page.getByTestId('admin-user-search').fill('admin');
    await page.getByTestId('admin-user-search-btn').click();
    // The seeded admin's row, found by its email rather than its (non-unique) name.
    const me = page.locator('tr[data-testid^="user-row-"]').filter({ has: page.getByRole('cell', { name: 'admin', exact: true }) });
    // QA-30: Revoke Admin is not offered on the own row (the server would refuse it anyway).
    await expect(me).toBeVisible();
    await expect(me.getByRole('button', { name: /Revoke Admin/ })).toHaveCount(0);
    await me.getByRole('button', { name: 'Suspend user' }).click();
    await expectToast(page, 'error', 'cannot suspend your own');
    await expect(me.locator('[data-superadmin]')).toHaveAttribute('data-superadmin', 'true');
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

test('[Q7.7] concurrent /api/admin/users reads never answer 5xx (SQLITE_BUSY)', async () => {
  const admin = await apiAsAdmin();
  const rs = await Promise.all(Array.from({ length: 40 }, () => admin.get('/api/admin/users')));
  for (const r of rs) expect(r.status()).toBe(200);
});

test('admin screen has a Close button that returns to the app', async ({ page }) => {
  await loginAdminUi(page);
  await page.goto('/admin');
  await page.getByTestId('admin-close').click();
  await expect(page).toHaveURL(/\/$/);
});

test('Add User fields are reachable by their visible labels', async ({ page }) => {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await page.getByTestId('admin-add-user-btn').click();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Temporary Password')).toBeVisible();
});

// UI-2: an error raised by a request that finishes after its modal has already closed must still
// surface (every modal held its error in local state, gone once the component unmounts). This drives
// the race: submit, close the modal before the delayed, failing response arrives, assert the toast.
test('a failed save after its modal is closed still shows a toast', async ({ page }) => {
  await loginAdminUi(page);
  await page.goto('/admin');
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

  // Delay and fail the create-user call so we have a window to close the modal before it settles.
  await page.route('**/api/admin/users', async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Email already in use' }),
    });
  });

  await page.getByTestId('admin-add-user-btn').click();
  await expect(page.getByTestId('add-user-modal')).toBeVisible();

  await page.getByTestId('add-user-name').fill('Race Condition User');
  await page.getByTestId('add-user-email').fill(`race-${Date.now()}@example.com`);
  await page.getByTestId('add-user-password').fill('whatever-password');
  await page.getByTestId('add-user-submit-btn').click();

  // Close the modal immediately, well before the mocked 1s response lands.
  await page.getByTestId('add-user-close-btn').click();
  await expect(page.getByTestId('add-user-modal')).not.toBeVisible();

  // The modal (and its local error state) is gone, but the toast store is independent of it.
  await expect(page.getByTestId('toast-error')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('toast-error')).toContainText('Email already in use');
});

test('[Q1.1] admin users list: search combined with cursor paging only returns matching users', async () => {
  const admin = await apiAsAdmin();
  const tag = `q11x${Date.now()}`;
  const created: string[] = [];
  for (let i = 0; i < 3; i++) {
    const email = `${tag}_${i}@example.com`;
    const r = await admin.post('/api/admin/users', { data: { name: `Q11 ${i}`, email, password: 'password123' } });
    expect(r.status(), 'create user').toBe(201);
    created.push(email);
  }
  const seen: string[] = [];
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const r = await admin.get(`/api/admin/users?search=${tag}&limit=1${cursor ? `&cursor=${cursor}` : ''}`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    for (const u of body.users) seen.push(u.email);
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  expect(seen.sort()).toEqual([...created].sort());
});

// Bug: GET /api/admin/users?search= escapes `_` and `%` with a backslash but sends no ESCAPE clause,
// and SQLite has no default escape character, so searching for an email containing `_` found nothing.
test('admin user search finds an email that contains an underscore', async () => {
  const admin = await apiAsAdmin();
  const tag = `us_${Date.now()}`;
  const email = `${tag}@example.com`;
  const created = await admin.post('/api/admin/users', { data: { name: 'Search Me', email, password: 'password123' } });
  expect(created.ok()).toBeTruthy();

  const res = await admin.get(`/api/admin/users?search=${encodeURIComponent(tag)}`);
  const { users } = await res.json();
  expect(users.map((u: any) => u.email)).toContain(email);

  // A literal wildcard must not widen the match: `%` alone matches no email here.
  const wild = await (await admin.get(`/api/admin/users?search=${encodeURIComponent('%' + tag)}`)).json();
  expect(wild.users).toHaveLength(0);
});

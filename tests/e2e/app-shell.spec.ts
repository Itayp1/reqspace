import { test, expect, fetchFpErrorsSince } from './fixtures';
import { registerUser, apiAs } from './helpers';

/**
 * App-level behaviour no spec covered: the database-error screen, unknown
 * routes, dynamic {{$variables}}, and changing a member's role from the
 * workspace settings (only invite and removal were tested).
 */
test.describe('App shell', () => {
  test.describe('database outage', () => {
    // The client reports the 503 from /api/health like any other failed API
    // call. The test asserts that report and then deletes it, so the table is
    // empty again; the allowance only matters if it fails before the cleanup.
    test.use({ allowFpErrors: ['/api/health'] });

  test('a database outage shows the database-error screen instead of a broken app', async ({ page, fpErrorsApi }) => {
    const since = new Date();
    await page.route('**/api/health', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', dbType: 'sqlite', dbError: 'SQLITE_CANTOPEN: unable to open database file' }),
    }));
    await page.goto('/');
    await expect(page.getByText('Database Connection Error')).toBeVisible();
    await expect(page.getByText('SQLITE_CANTOPEN: unable to open database file')).toBeVisible();
    await page.getByText('How to fix this').click();
    await expect(page.getByText('Common fixes:')).toBeVisible();

    // The failed health check reached fperrors (the client reporting path
    // works), and is cleared so the run leaves the table empty.
    let fingerprint = '';
    await expect.poll(async () => {
      const group = (await fetchFpErrorsSince(fpErrorsApi, since)).find(g => g.kind === 'api' && g.route === '/api/health');
      fingerprint = group?.fingerprint ?? '';
      return group?.message ?? '';
    }).toContain('503');
    expect((await fpErrorsApi.delete(`/api/admin/errors/${fingerprint}`)).ok()).toBeTruthy();
  });
  });

  test('an unknown path lands on the app (or login), not a blank page', async ({ page }) => {
    await page.goto('/definitely/not/a/route');
    await expect(page).toHaveURL(/\/login$/);
    await registerUser(page, 'shell_route');
    await page.goto('/another/missing/page');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  });

  test('dynamic variables resolve to fresh values when the request is sent', async ({ page }) => {
    await registerUser(page, 'shell_dyn');
    const seen: string[] = [];
    await page.route('https://dyn.example.test/**', (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, body: 'ok' });
    });
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://dyn.example.test/item?id={{$guid}}&n={{$randomInt}}&t={{$timestamp}}');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]);
    expect(url.searchParams.get('id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(url.searchParams.get('n')).toMatch(/^\d+$/);
    expect(Number(url.searchParams.get('t'))).toBeGreaterThan(1_700_000_000);
  });

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
    await expect(page.getByTestId('workspace-select')).toContainText(`Roles WS ${ts}`);
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(`Roles WS ${ts}`);
    const wsId = await page.getByTestId('workspace-select').inputValue();

    await page.getByTestId('workspace-settings-btn').click();
    await page.getByTestId('workspace-members-tab').click();
    await page.getByTestId('user-autocomplete-input').fill(memberEmail);
    await page.getByTestId('user-autocomplete-result').first().click();
    await page.getByTestId('workspace-invite-role').selectOption('viewer');
    await page.getByTestId('workspace-invite-btn').click();
    const row = page.getByTestId('member-row').filter({ hasText: memberEmail });
    await expect(row.getByTestId('member-role-select')).toHaveValue('viewer');

    const memberApi = await apiAs(memberEmail);
    const roleOf = async () => ((await (await memberApi.get('/api/workspaces')).json()) as any[]).find(w => w._id === wsId)?.myRole;
    expect(await roleOf()).toBe('viewer');

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

import { test, expect, fetchFpErrorsSince } from '../fixtures';

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
});

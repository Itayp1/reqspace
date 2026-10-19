import { test, expect } from './fixtures';
import { API_URL } from './fixtures';
import { loginAdminUi } from './helpers';

/** Q7.2 (finding 183): the Admin Errors dashboard needs date-range filtering and column sorting. */
test.describe('Q7.2 errors dashboard', () => {
  test.use({ allowFpErrors: [/q72-probe/] });

  test('[Q7.2] errors can be sorted by count and bounded by a date range in the UI', async ({ page, request }) => {
    const marker = `q72-probe-${Date.now()}`;
    const few = `${marker}-few`;
    const many = `${marker}-many`;
    const post = (message: string) =>
      request.post(`${API_URL}/api/errors`, { headers: { 'X-Forwarded-For': '10.252.7.2' }, data: { kind: 'window.error', message } });
    expect((await post(few)).status()).toBe(204);
    for (let i = 0; i < 3; i++) expect((await post(many)).status()).toBe(204);

    await loginAdminUi(page);
    await page.getByTestId('admin-dashboard-link').click();
    await page.getByTestId('admin-tab-errors').click();
    await page.getByTestId('errors-search').fill(marker);
    await page.getByTestId('errors-search-btn').click();
    const rows = page.getByTestId('error-row');
    await expect(rows).toHaveCount(2);

    // Sort by count (descending): the 3x group comes first.
    await page.getByTestId('errors-sort').selectOption('count');
    await expect(rows.first()).toContainText(many);

    // A date range entirely in the future hides everything; an open range containing today shows both.
    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    await page.getByTestId('errors-from').fill(day(2));
    await expect(rows).toHaveCount(0);
    await page.getByTestId('errors-from').fill(day(-1));
    await page.getByTestId('errors-to').fill(day(1));
    await expect(rows).toHaveCount(2);
  });
});

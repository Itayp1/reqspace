import { test, expect } from './fixtures';
import { loginAdminUi } from './helpers';

test.describe('Q9.6 SMTP test connection double click', () => {
  test('[Q9.6] double-clicking Test Connection sends a single request', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/admin/test-smtp', async (route) => {
      calls++;
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) });
    });
    await loginAdminUi(page);
    await page.goto('/admin');
    await page.getByTestId('admin-tab-settings').click();
    const smtp = page.getByTestId('admin-smtp-enabled');
    if (!(await smtp.isChecked())) await smtp.check();
    await page.getByTestId('admin-smtp-host').fill('smtp.example.test');
    const btn = page.getByTestId('admin-smtp-test');
    await btn.dblclick({ delay: 0 });
    // Also fire two clicks in the same task, before React can re-render the disabled state.
    await btn.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    await expect(btn).toHaveText('Test Connection', { timeout: 10_000 });
    expect(calls).toBe(1);
  });
});

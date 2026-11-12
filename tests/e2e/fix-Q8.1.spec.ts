import { test, expect } from './fixtures';
import { apiAsAdmin, loginAdminUi } from './helpers';

test.describe('Q8.1 admin history limits', () => {
  test('[Q8.1] System Settings has max-records and retention-days fields that persist', async ({ page }) => {
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    try {
      await loginAdminUi(page);
      await page.goto('/admin');
      await page.getByTestId('admin-tab-settings').click();
      const maxRecords = page.getByTestId('admin-history-max-records');
      const retention = page.getByTestId('admin-history-retention-days');
      await expect(maxRecords).toBeVisible();
      await expect(retention).toBeVisible();
      await maxRecords.fill('777');
      await retention.fill('45');
      await page.getByTestId('admin-save-config').click();
      await expect.poll(async () => {
        const cfg = await (await admin.get('/api/admin/config')).json();
        return `${cfg.history?.maxRecords}/${cfg.history?.retentionDays}`;
      }).toBe('777/45');
    } finally {
      await admin.put('/api/admin/config', {
        data: { history: { maxRecords: before.history?.maxRecords ?? 0, retentionDays: before.history?.retentionDays ?? 0 } },
      });
    }
  });
});

import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test.describe('App shell', () => {
  test('an unknown path lands on the app (or login), not a blank page', async ({ page }) => {
    await page.goto('/definitely/not/a/route');
    await expect(page).toHaveURL(/\/login$/);
    await registerUser(page, 'shell_route');
    await page.goto('/another/missing/page');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  });
});

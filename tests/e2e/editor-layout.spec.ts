import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('request editor keeps a usable height with the console open', async ({ page }) => {
  await registerUser(page, 'layout');
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('console-toggle-btn').click();
  await expect(page.getByTestId('console-drawer')).toBeVisible();
  await expect(page.getByTestId('kv-key-0')).toBeInViewport();
  await expect(page.getByTestId('new-connection-btn')).toContainText('Conn');
});

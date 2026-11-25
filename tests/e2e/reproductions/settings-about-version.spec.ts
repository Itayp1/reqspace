import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test('[ABOUT] Global Settings shows the app version', async ({ page }) => {
  await registerUser(page, 'about1');
  await page.getByTestId('settings-btn').click();
  await expect(page.getByTestId('about-section')).toBeVisible();
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);
});

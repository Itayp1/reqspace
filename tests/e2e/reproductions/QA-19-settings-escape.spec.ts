import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** QA-19: Escape closes Global Search but not Global Settings. */
test('Escape closes Global Settings', async ({ page }) => {
  await registerUser(page, 'qa19');
  await page.getByTestId('settings-btn').click();
  await expect(page.getByTestId('global-settings-close-btn')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('global-settings-close-btn')).toHaveCount(0);
});

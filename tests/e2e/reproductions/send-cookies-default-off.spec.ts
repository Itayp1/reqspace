import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** "Send Cookies Automatically" used to be on for every new user. */
test('"Send Cookies Automatically" is off by default', async ({ page }) => {
  await registerUser(page, 'cookiedef');
  await page.getByTestId('settings-btn').click();
  await expect(page.locator('#sendCookies')).not.toBeChecked();
});

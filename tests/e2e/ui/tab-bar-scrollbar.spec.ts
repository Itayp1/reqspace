import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** UX (QA-68): the tab bar scrolls without a visible scrollbar; long tab names have a tooltip. */
test('tab bar hides its scrollbar and tabs carry a title tooltip', async ({ page }) => {
  await registerUser(page, 'uxtabs');
  await page.getByTestId('new-tab-btn').click();
  const bar = page.getByTestId('new-tab-btn').locator('xpath=ancestor::div[contains(@class,"scrollbar-hide")][1]');
  await expect(bar).toHaveCSS('scrollbar-width', 'none');
  await expect(bar.locator('span.truncate').first()).toHaveAttribute('title', /.+/);
});

import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// Modals must be role="dialog" and Escape must close Global Settings (QA-19).
test('Global Settings is a dialog and Escape closes it', async ({ page }) => {
  await registerUser(page, 'qa19');
  await page.getByLabel('Open general settings').click();
  await expect(page.getByTestId('global-settings-close-btn')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('global-settings-close-btn')).toHaveCount(0);
});
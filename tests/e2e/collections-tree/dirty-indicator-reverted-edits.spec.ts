import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// The unsaved-changes dot must reflect a real difference from the saved state, not "an edit happened".
test('request tab: type then delete a header value leaves the tab clean', async ({ page }) => {
  await registerUser(page, 'dirtyreq');
  await page.getByTestId('new-tab-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  await page.getByRole('tab', { name: /Headers/ }).click();
  await page.getByTestId('kv-key-0').fill('X-Tmp');
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(1);
  await page.getByTestId('kv-key-0').fill('');
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
});

test('environment tab: adding a row and never filling it leaves the tab clean', async ({ page }) => {
  await registerUser(page, 'dirtyenv');
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('new-env-btn').click();
  await page.getByTestId('prompt-input').fill('Dirty Env');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('env-node-Dirty Env')).toBeVisible();
  await page.getByTestId('add-env-var-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  await expect(page.getByTestId('env-save-btn')).toBeDisabled();
});

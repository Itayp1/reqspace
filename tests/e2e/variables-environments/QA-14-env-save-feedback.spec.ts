import { test, expect } from '../fixtures';
import { registerUser, expectToast } from '../helpers';

/** QA-14: environment Save gave no confirmation and was enabled with nothing to save. */
test('environment Save confirms with a toast and is disabled when clean', async ({ page }) => {
  await registerUser(page, 'qa14');
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('new-env-btn').click();
  await page.getByTestId('prompt-input').fill('Save Env');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('env-node-Save Env')).toBeVisible();

  const save = page.getByTestId('env-save-btn');
  await expect(save).toBeDisabled();
  await page.getByTestId('add-env-var-btn').click();
  await page.getByTestId('env-var-key-0').fill('k');
  await expect(save).toBeEnabled();
  await save.click();
  await expectToast(page, 'success', 'Environment saved');
  await expect(save).toBeDisabled();
});

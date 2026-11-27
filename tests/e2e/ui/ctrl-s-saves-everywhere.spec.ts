import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** Ctrl+S saved only requests and environments; profile variables and workspace settings ignored it. */
test('Ctrl+S saves profile variables', async ({ page }) => {
  await registerUser(page, 'ctrls');
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('env-profile-variables-btn').click();
  const editor = page.getByTestId('profile-variables-editor');
  await editor.getByRole('button', { name: 'Add Variable' }).click();
  await editor.getByPlaceholder('New variable').last().fill('ctrlsvar');
  await editor.getByPlaceholder('Value').last().fill('1');
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Profile variables saved')).toBeVisible();
});

test('Ctrl+S saves Workspace Settings', async ({ page }) => {
  await registerUser(page, 'ctrlsws');
  await page.getByTestId('workspace-settings-btn').click();
  await expect(page.getByText('Loading details…')).toBeHidden();
  await page.getByLabel('Workspace Name').fill('Renamed by shortcut');
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Workspace settings saved')).toBeVisible();
});

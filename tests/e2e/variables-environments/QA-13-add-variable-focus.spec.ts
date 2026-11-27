import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** QA-13 / QA-34: "Add a new variable" / "Add Variable" must focus the new row's key input. */
test.describe('Add variable focuses the key input', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'qa13');
    await page.getByTestId('tab-environments').click();
  });

  test('environment editor', async ({ page }) => {
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Focus Env');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('env-node-Focus Env')).toBeVisible();
    await page.getByTestId('add-env-var-btn').click();
    await page.keyboard.type('tmpvar');
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('tmpvar');
  });

  test('profile variables editor', async ({ page }) => {
    await page.getByTestId('env-profile-variables-btn').click();
    const editor = page.getByTestId('profile-variables-editor');
    await editor.getByRole('button', { name: /Add Variable/ }).click();
    await page.keyboard.type('tmpvar');
    await expect(editor.getByPlaceholder('New variable')).toHaveValue('tmpvar');
  });
});

import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('empty raw body editor shows a placeholder that disappears once you type', async ({ page }) => {
  await registerUser(page, 'editor_ph');
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('req-tab-body').click();
  await page.getByTestId('body-mode-raw').click();
  const ph = page.getByTestId('editor-placeholder');
  await expect(ph).toBeVisible();
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.type('{}');
  await expect(ph).toBeHidden();
});

import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('Escape closes the collection runner and cancels a confirm dialog', async ({ page }) => {
  await registerUser(page, 'esc_modals');
  const newBtn = page.getByTestId('new-collection-empty-btn');
  if (await newBtn.isVisible().catch(() => false)) await newBtn.click();
  else await page.getByTestId('new-collection-btn').click();
  await page.getByTestId('prompt-input').fill('Esc Col');
  await page.getByTestId('prompt-submit').click();
  const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Esc Col') });
  await colNode.hover();
  await colNode.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  const runner = page.getByTestId('collection-runner-modal');
  await expect(runner).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(runner).toBeHidden();

  // A dirty-tab close prompts a ConfirmModal; Escape cancels it and keeps the tab.
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('request-url-input').fill('https://esc.example.test');
  await page.getByTestId('close-tab-btn').first().click();
  await expect(page.getByTestId('confirm-cancel-btn')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('confirm-cancel-btn')).toBeHidden();
  await expect(page.getByTestId('close-tab-btn')).toHaveCount(1);
});

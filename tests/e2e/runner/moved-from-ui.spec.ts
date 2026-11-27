import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu } from '../helpers';

/** UX: the runner title has no colon; Escape closes the runner. */
test('Run dialog title has no colon', async ({ page }) => {
  await registerUser(page, 'uxrun');
  await createCollectionUi(page, 'RunCol');
  await openNodeMenu(page, 'RunCol');
  await page.getByTestId('action-menu-run-collection').click();
  await expect(page.getByTestId('collection-runner-modal').getByRole('heading')).toHaveText('Run “RunCol”');
});

test('Escape closes the collection runner', async ({ page }) => {
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
});

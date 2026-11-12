import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu } from '../helpers';

/** UX: creating a workspace is an inline name field (no dialog); the runner title has no colon. */
test('New Workspace is an inline name field, no dialog', async ({ page }) => {
  await registerUser(page, 'uxprompt');
  await page.getByTestId('new-workspace-btn').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const input = page.getByTestId('prompt-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveAccessibleName('Workspace name');
  await input.fill('Inline WS');
  await input.press('Enter');
  await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText('Inline WS');
});

test('Run dialog title has no colon', async ({ page }) => {
  await registerUser(page, 'uxrun');
  await createCollectionUi(page, 'RunCol');
  await openNodeMenu(page, 'RunCol');
  await page.getByTestId('action-menu-run-collection').click();
  await expect(page.getByTestId('collection-runner-modal').getByRole('heading')).toHaveText('Run “RunCol”');
});

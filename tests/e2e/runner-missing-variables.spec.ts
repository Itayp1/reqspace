import { test, expect } from './fixtures';
import { registerUser, createCollectionUi, addViaMenu, treeNode, openNodeMenu } from './helpers';

test('runner asks to create variables that have no record, then runs; a second run does not ask', async ({ page }) => {
  await registerUser(page, 'mvr');
  await page.route('https://mv.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await createCollectionUi(page, 'MV Col');
  await addViaMenu(page, 'MV Col', 'new-request', 'One');
  await treeNode(page, 'One').click();
  await page.getByTestId('request-url-input').fill('https://mv.example.test/{{segment}}');
  await page.getByTestId('request-save-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);

  await openNodeMenu(page, 'MV Col');
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-run-btn').click();

  const dialog = page.getByTestId('missing-variables-modal');
  await expect(dialog).toContainText('segment');
  await page.getByTestId('missing-var-value-segment').fill('abc');
  await page.getByTestId('missing-variables-create').click();
  await expect(dialog).toHaveCount(0);
  const runner = page.getByTestId('collection-runner-modal');
  await expect(runner).toContainText('Passed1');

  // The variable now exists, so the next run starts straight away.
  await page.getByTestId('collection-runner-run-btn').click();
  await expect(runner).toContainText('Passed1');
  await expect(dialog).toHaveCount(0);
});

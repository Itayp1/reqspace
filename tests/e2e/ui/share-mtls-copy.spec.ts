import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu } from '../helpers';

/** UX (QA-56): the share dialog says what a link exposes, before generating it. */
test('Share dialog states what is and is not shared', async ({ page }) => {
  await registerUser(page, 'uxshare');
  await createCollectionUi(page, 'ShareCol');
  await openNodeMenu(page, 'ShareCol');
  await page.getByText('Share via Link').click();
  const note = page.getByTestId('share-link-exposure');
  await expect(note).toContainText('Shared:');
  await expect(note).toContainText('Not shared:');
  await expect(note).toContainText('environment values');
});

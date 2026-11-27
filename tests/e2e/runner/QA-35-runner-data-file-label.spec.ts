import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu } from '../helpers';

/** QA-35: the runner's Data File picker used the browser-localised native input ("בחירת קובץ"). It must show an English label. */
test('Run Collection data-file picker shows an English "Choose file" label', async ({ page }) => {
  await registerUser(page, 'qa35');
  await createCollectionUi(page, 'RunCol');
  await openNodeMenu(page, 'RunCol');
  await page.getByTestId('action-menu-run-collection').click();
  const modal = page.getByTestId('collection-runner-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Choose file', { exact: true })).toBeVisible();
  await expect(page.getByTestId('collection-runner-data-file')).toHaveClass(/sr-only/); // visually hidden native input
});

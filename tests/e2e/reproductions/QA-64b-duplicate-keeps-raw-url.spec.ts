import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu, openNodeMenu } from '../helpers';

// QA-64b: every Duplicate path must keep the raw {{baseUrl}} URL, never a resolved one.
test('QA-64b: tree Duplicate and Duplicate Tab keep {{baseUrl}}', async ({ page }) => {
  await registerUser(page, 'qa64b');
  await createCollectionUi(page, 'RawCol');
  await addViaMenu(page, 'RawCol', 'new-request', 'RawReq');
  const raw = '{{baseUrl}}/api/x';
  await page.getByTestId('request-url-input').fill(raw);
  await page.getByTestId('request-save-btn').click();

  await openNodeMenu(page, 'RawReq');
  await page.getByText('Duplicate', { exact: true }).click();
  await page.getByTestId('node-RawReq (Copy)').click();
  await expect(page.getByTestId('request-url-input')).toHaveValue(raw);

  await page.locator('[data-testid^="tab-"]').filter({ hasText: 'RawReq (Copy)' }).first().click({ button: 'right' });
  await page.getByTestId('tab-menu-duplicate').click();
  await expect(page.getByTestId('request-url-input')).toHaveValue(raw);
});

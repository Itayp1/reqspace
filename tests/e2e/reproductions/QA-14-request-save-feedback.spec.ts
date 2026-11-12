import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu, expectToast } from '../helpers';

// QA-14 / QA-60: saving a request must confirm with a toast, like Local Variables and environments do.
test('QA-14: saving a request shows a success toast', async ({ page }) => {
  await registerUser(page, 'qa14r');
  await createCollectionUi(page, 'SaveCol');
  await addViaMenu(page, 'SaveCol', 'new-request', 'SaveReq');
  await page.getByTestId('request-url-input').fill('https://example.test/saved');
  await page.getByTestId('request-save-btn').click();
  await expectToast(page, 'success', 'Request saved');
});

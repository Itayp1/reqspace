import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu } from '../helpers';

// QA-77: the Save dialog of a duplicated tab must default to the original request's collection, not the first one.
test('QA-77: Duplicate Tab then Save defaults to the original collection', async ({ page }) => {
  await registerUser(page, 'qa77');
  await createCollectionUi(page, 'FirstCol');
  await createCollectionUi(page, 'HomeCol');
  await addViaMenu(page, 'HomeCol', 'new-request', 'HomeReq');
  await page.getByTestId('request-url-input').fill('https://example.test/home');
  await page.getByTestId('request-save-btn').click();

  await page.locator('[data-testid^="tab-"]').filter({ hasText: 'HomeReq' }).first().click({ button: 'right' });
  await page.getByTestId('tab-menu-duplicate').click();
  await page.getByTestId('request-save-btn').click();

  const row = (n: string) => page.getByTestId('save-req-submit-btn').locator('xpath=ancestor::form').getByRole('button', { name: n });
  await expect(row('HomeCol')).toHaveClass(/bg-primary/);
  await expect(row('FirstCol')).not.toHaveClass(/bg-primary/);
});

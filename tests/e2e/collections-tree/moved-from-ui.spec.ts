import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi } from '../helpers';

// QA-11: the empty-state "Create a Request" opened an unsaved draft while the tree asks for a name.
test('QA-11: empty-state Create a Request asks for a name and saves into the first collection', async ({ page }) => {
  await registerUser(page, 'qa11');
  await createCollectionUi(page, 'First Col');

  await page.getByTestId('create-request-btn').click();
  await page.getByTestId('prompt-input').fill('Named Request');
  await page.getByTestId('prompt-submit').click();

  await expect(page.getByTestId('node-Named Request')).toBeVisible();
  await expect(page.getByTestId('request-url-input')).toBeVisible();
});

test('QA-11: with no collection the button still opens a draft', async ({ page }) => {
  await registerUser(page, 'qa11b');
  await page.getByTestId('create-request-btn').click();
  await expect(page.getByTestId('request-url-input')).toBeVisible();
  await expect(page.getByTestId('prompt-input')).toHaveCount(0);
});

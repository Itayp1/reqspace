import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu } from '../helpers';

// QA-02: a request created from the collection menu was not opened, so the editor kept the previous draft.
test('QA-02: a request created from the collection menu opens in the editor', async ({ page }) => {
  await registerUser(page, 'qa02');
  await createCollectionUi(page, 'Col');
  await page.getByTestId('new-tab-btn').click(); // an unrelated draft is on screen

  await openNodeMenu(page, 'Col');
  await page.getByTestId('action-menu-new-request').click();
  await page.getByTestId('prompt-input').fill('Get Users');
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && /\/collections\/[^/]+\/requests$/.test(r.url()));
  await page.getByTestId('prompt-input').press('Enter');
  const id = (await (await created).json())._id;

  // Whatever is typed now must land on the new request, not on the old draft.
  await page.getByTestId('request-url-input').fill('https://example.test/users');
  await page.getByTestId('request-save-btn').click();
  await expect.poll(async () => (await (await page.request.get(`/api/requests/${id}`)).json()).url).toBe('https://example.test/users');
});

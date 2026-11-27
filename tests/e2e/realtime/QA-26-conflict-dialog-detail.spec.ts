import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu } from '../helpers';

// QA-26 / QA-39: the save-conflict dialog must say when the server copy was last saved.
test('QA-26: conflict dialog shows when the newer version was saved', async ({ page }) => {
  await registerUser(page, 'qa26');
  await createCollectionUi(page, 'ConfCol');
  await addViaMenu(page, 'ConfCol', 'new-request', 'ConfReq');
  await page.reload();
  await page.getByTestId('node-ConfCol').click();
  const loaded = page.waitForResponse((r) => /\/api\/requests\/[^/]+$/.test(r.url()) && r.request().method() === 'GET');
  await page.getByTestId('node-ConfReq').click();
  const id = (await (await loaded).json())._id;

  await page.getByTestId('request-url-input').fill('https://example.test/local');
  // Someone else saves a newer version.
  const put = await page.request.put(`/api/requests/${id}`, { data: { url: 'https://example.test/remote' } });
  expect(put.ok()).toBeTruthy();

  await page.getByTestId('request-save-btn').click();
  await expect(page.locator('#confirm-modal-description')).toContainText('last saved');
});

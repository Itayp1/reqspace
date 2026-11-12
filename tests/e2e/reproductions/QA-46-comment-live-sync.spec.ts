import { test, expect } from '../fixtures';
import { registerUser, loginUi, createCollectionUi, addViaMenu } from '../helpers';

// QA-46: a comment added in browser B was not shown live in browser A (Comments tab open).
test('a comment posted in another browser appears live in the open Comments tab', async ({ page, browser }) => {
  const email = await registerUser(page, 'qa46');
  await createCollectionUi(page, 'QA46 Col');
  await addViaMenu(page, 'QA46 Col', 'new-request', 'QA46 Req');
  await page.getByTestId('node-QA46 Req').click();
  await page.getByTestId('req-tab-comments').click();
  await expect(page.getByTestId('comment-item')).toHaveCount(0);

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await loginUi(pageB, email);
  await pageB.getByTestId('node-QA46 Col').click();
  await pageB.getByTestId('node-QA46 Req').click();
  await pageB.getByTestId('req-tab-comments').click();
  await pageB.getByTestId('comment-input').fill('from browser B');
  await pageB.getByTestId('comment-submit-btn').click();
  await expect(pageB.getByTestId('comment-item')).toHaveCount(1);

  // No reload in A.
  await expect(page.getByTestId('comment-text')).toHaveText('from browser B');
  await ctxB.close();
});

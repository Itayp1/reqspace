import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu } from '../helpers';

// QA-47: a viewer saw an editable request editor with no hint that it is read-only.
test('a viewer gets a read-only URL bar and a "View only" note', async ({ page }) => {
  await registerUser(page, 'qa47');
  await createCollectionUi(page, 'QA47 Col');
  await addViaMenu(page, 'QA47 Col', 'new-request', 'QA47 Req');

  // Serve the workspace list as if this user were only a viewer of it.
  await page.route(/\/api\/workspaces$/, async (route) => {
    const res = await route.fetch();
    const list = await res.json();
    await route.fulfill({ response: res, json: list.map((w: any) => ({ ...w, myRole: 'viewer' })) });
  });
  await page.reload();
  await page.getByTestId('node-QA47 Col').click();
  await page.getByTestId('node-QA47 Req').click();

  await expect(page.getByTestId('view-only-note')).toBeVisible();
  await expect(page.getByTestId('request-url-input')).toHaveAttribute('readonly', '');
});

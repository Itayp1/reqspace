import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu, openNodeMenu, treeNode, expectToast } from '../helpers';

/**
 * QA-20: renaming a request in the tree while its tab has unsaved edits turned the tab dot red
 * (the socket echo of our own rename was treated as a conflict). It must stay the orange dirty dot.
 */
test('renaming a dirty request keeps the orange dirty dot (no conflict dot)', async ({ page }) => {
  await registerUser(page, 'qa20');
  await createCollectionUi(page, 'Col20');
  await addViaMenu(page, 'Col20', 'new-request', 'Req20');
  await treeNode(page, 'Req20').click();
  await page.getByTestId('request-url-input').click();
  await page.keyboard.type('http://example.test/x');
  await expect(page.getByTestId('dirty-indicator')).toBeVisible();

  await openNodeMenu(page, 'Req20');
  await page.getByTestId('action-menu-rename').click();
  await page.getByTestId('inline-rename-input').fill('Req20 renamed');
  await page.getByTestId('inline-rename-input').press('Enter');
  await expect(page.getByTestId('node-Req20 renamed')).toBeVisible();

  // Give the socket echo time to arrive.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('conflict-indicator')).toHaveCount(0);
  await expect(page.getByTestId('dirty-indicator')).toBeVisible();
});

// The unsaved-changes dot must reflect a real difference from the saved state, not "an edit happened".
test('request tab: type then delete a header value leaves the tab clean', async ({ page }) => {
  await registerUser(page, 'dirtyreq');
  await page.getByTestId('new-tab-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  await page.getByRole('tab', { name: /Headers/ }).click();
  await page.getByTestId('kv-key-0').fill('X-Tmp');
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(1);
  await page.getByTestId('kv-key-0').fill('');
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
});

// the rejected-save test provokes a 400 on purpose; the app records it in fperrors
test.describe('Tree operations', () => {
  test.use({ allowFpErrors: [/Failed to update request .*status code 400/] });

  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'tree');
  });

  test('a save the server rejects says so and leaves the tab dirty', async ({ page }) => {
    await createCollectionUi(page, 'Fail Col');
    await addViaMenu(page, 'Fail Col', 'new-request', 'Fragile');
    await treeNode(page, 'Fragile').click();
    await page.getByTestId('request-url-input').fill('https://will-not-save.example.test');

    await page.route('**/api/requests/*', (route) => route.request().method() === 'PUT'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated rejection' }) })
      : route.continue());
    await page.getByTestId('request-save-btn').click();
    await expectToast(page, 'error', 'Save failed: Simulated rejection');
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(1);
    await expect(page.getByTestId('request-save-btn')).toContainText('Save*');

    // Once the server accepts it, the same tab saves cleanly.
    await page.unroute('**/api/requests/*');
    const put = page.waitForResponse(r => /\/api\/requests\//.test(r.url()) && r.request().method() === 'PUT');
    await page.getByTestId('request-save-btn').click();
    expect((await put).status()).toBe(200);
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  });

  test('re-opening a request from the tree keeps the tab\'s unsaved edits', async ({ page }) => {
    await createCollectionUi(page, 'Edit Col');
    await addViaMenu(page, 'Edit Col', 'new-request', 'First');
    await addViaMenu(page, 'Edit Col', 'new-request', 'Second');

    await treeNode(page, 'First').click();
    await page.getByTestId('request-url-input').fill('https://edited.example.test/kept');
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(1);

    await treeNode(page, 'Second').click();
    await expect(page.getByTestId('request-url-input')).toHaveValue('');
    await treeNode(page, 'First').click();
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://edited.example.test/kept');
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(1);
  });
});

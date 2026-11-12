import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu, openNodeMenu, treeNode } from '../helpers';

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

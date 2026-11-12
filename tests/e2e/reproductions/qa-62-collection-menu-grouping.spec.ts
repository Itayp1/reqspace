import { test, expect } from '../fixtures';

// QA-62: the collection menu is one flat list and "Edit" does not say what it edits.
test('QA-62: collection menu is grouped with separators and Edit is named', async ({ page }) => {
  const ts = Date.now();
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Menu User');
  await page.getByTestId('register-email').fill(`qa62_${ts}@example.com`);
  await page.getByTestId('register-password').fill('password123');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/.*\/$/);

  await page.getByTestId('new-collection-empty-btn').click();
  await page.getByTestId('prompt-input').fill('Menu Col');
  await page.getByTestId('prompt-submit').click();

  const node = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Menu Col') });
  await node.hover();
  await node.getByTestId('action-menu-btn').click();

  const menu = page.getByRole('menu', { name: 'Item actions menu' });
  await expect(menu.getByRole('separator').first()).toBeVisible();
  expect(await menu.getByRole('separator').count()).toBeGreaterThanOrEqual(3);
  await expect(menu.getByRole('menuitem', { name: 'Edit Settings' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Edit', exact: true })).toHaveCount(0);
});

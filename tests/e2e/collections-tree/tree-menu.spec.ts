import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu } from '../helpers';

// QA-03/04/61/62: the item menu groups its actions, names "Edit Settings", and truncated tree names have a tooltip.
test('collection menu is grouped with separators and names Edit Settings', async ({ page }) => {
  await registerUser(page, 'treemenu');
  await createCollectionUi(page, 'Menu Col With A Very Long Name That Will Be Truncated In The Sidebar');
  const name = 'Menu Col With A Very Long Name That Will Be Truncated In The Sidebar';
  await expect(page.getByTestId(`node-${name}`)).toHaveAttribute('title', name);
  await openNodeMenu(page, name);
  await expect(page.getByTestId('action-menu-edit-settings')).toBeVisible();
  await expect(page.getByTestId('action-menu-separator').first()).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCSS('opacity', '1');
});

import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu, addViaMenu } from '../helpers';

// Creates a collection named `name` in the user's personal workspace through the API and reloads.
async function seedCollection(page: import('@playwright/test').Page, name: string) {
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const wsId = ws.id ?? ws._id;
  expect((await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name } })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
}

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

test.describe('Collection menu and sort', () => {
  test('the collection menu drops New Request, Sort A-Z and Fork to Workspace; a folder menu drops New Request and Sort', async ({ page }) => {
    await registerUser(page, 'colmenu');
    await createCollectionUi(page, 'Menu Col');
    await openNodeMenu(page, 'Menu Col');
    await expect(page.getByTestId('action-menu-duplicate')).toBeVisible();
    await expect(page.getByTestId('action-menu-copy-to-workspace')).toBeVisible();
    for (const gone of ['new-request', 'sort-a-z', 'fork-to-workspace', 'duplicate-/-fork']) {
      await expect(page.getByTestId(`action-menu-${gone}`)).toHaveCount(0);
    }
    await page.keyboard.press('Escape');

    await addViaMenu(page, 'Menu Col', 'new-folder', 'Menu Folder');
    await openNodeMenu(page, 'Menu Folder');
    await expect(page.getByTestId('action-menu-new-folder')).toBeVisible();
    await expect(page.getByTestId('action-menu-new-request')).toHaveCount(0);
    await expect(page.getByTestId('action-menu-sort-a-z')).toHaveCount(0);
  });

});

test('a right-click menu closes when you right-click elsewhere or the window loses focus', async ({ page }) => {
  await registerUser(page, 'ctxopen');
  await seedCollection(page, 'Col');

  const menu = page.getByRole('menu');
  await page.getByTestId('node-Col').click({ button: 'right' });
  await expect(menu).toBeVisible();

  // Right-click on an area that has no menu of its own: the native menu would open, ours must close.
  await page.mouse.click(900, 10, { button: 'right' });
  await expect(menu).toBeHidden();

  // Window loses focus (alt-tab, click into an iframe).
  await page.getByTestId('node-Col').click({ button: 'right' });
  await expect(menu).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(menu).toBeHidden();
});

test('the gear next to a collection opens its settings without right-click', async ({ page }) => {
  await registerUser(page, 'gear');
  await seedCollection(page, 'Col');

  await page.getByTestId('node-Col').hover();
  await page.getByTestId('settings-Col').click();
  await expect(page.getByRole('dialog', { name: 'Edit collection Col' })).toBeVisible();
  await expect(page.getByTestId('group-edit-variables-tab')).toBeVisible();
});

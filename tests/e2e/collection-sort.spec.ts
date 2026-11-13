import { test, expect } from './fixtures';
import { registerUser, createCollectionUi, openNodeMenu, addViaMenu, treeNode } from './helpers';

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

  test('collections sort by name, creation or manual order, and the choice is kept per user across a reload', async ({ page }) => {
    await registerUser(page, 'colsort');
    for (const n of ['Bravo', 'Alpha', 'Charlie']) await createCollectionUi(page, n);
    const names = () => page.locator('[data-testid="node-Bravo"], [data-testid="node-Alpha"], [data-testid="node-Charlie"]').allTextContents();
    const sort = page.getByTestId('collection-sort-select');
    expect(await names()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    await expect(sort).toHaveValue('manual');

    const saved = page.waitForResponse(r => r.url().includes('/auth/settings') && r.request().method() === 'PUT');
    await sort.selectOption('name');
    expect((await saved).ok()).toBeTruthy();
    await expect.poll(names).toEqual(['Alpha', 'Bravo', 'Charlie']);

    // Kept on the server, not just in this browser.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(treeNode(page, 'Alpha')).toBeVisible();
    await expect(sort).toHaveValue('name');
    await expect.poll(names).toEqual(['Alpha', 'Bravo', 'Charlie']);

    await sort.selectOption('created');
    await expect.poll(names).toEqual(['Charlie', 'Alpha', 'Bravo']);
    await sort.selectOption('manual');
    await expect.poll(names).toEqual(['Bravo', 'Alpha', 'Charlie']);
  });
});

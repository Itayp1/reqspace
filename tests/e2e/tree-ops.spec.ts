import { test, expect } from './fixtures';
import { registerUser, createCollectionUi, addViaMenu, openNodeMenu, treeNode, expectToast, apiAs } from './helpers';

/**
 * Sidebar tree operations that were broken or untested:
 *
 *  - Deleting a request that sits inside a folder asked to "Delete Folder" and
 *    sent DELETE /folders/<request id>; nothing was ever removed.
 *  - Deleting a folder removed only one level; requests in its subfolders
 *    stayed in the database and resurfaced in share links, forks and the runner.
 *  - Clicking a request that was already open in a tab overwrote that tab's
 *    unsaved edits with the stored copy.
 *  - A save the server rejected still showed as saved.
 */
test.describe('Tree operations', () => {
  let email = '';

  test.beforeEach(async ({ page }) => {
    email = await registerUser(page, 'tree');
  });

  test('a request inside a folder can be deleted, and stays deleted after a reload', async ({ page }) => {
    await createCollectionUi(page, 'Tree Col');
    await addViaMenu(page, 'Tree Col', 'new-folder', 'Box');
    await treeNode(page, 'Box').click();
    await openNodeMenu(page, 'Box');
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Inside Box');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Inside Box')).toBeVisible();

    await openNodeMenu(page, 'Inside Box');
    await page.getByTestId('action-menu-delete').click();
    await expect(page.getByText('Delete Request', { exact: true })).toBeVisible();
    const del = page.waitForResponse(r => /\/api\/requests\//.test(r.url()) && r.request().method() === 'DELETE');
    await page.getByTestId('confirm-btn').click();
    expect((await del).status()).toBe(200);
    await expect(page.getByTestId('node-Inside Box')).toHaveCount(0);

    await page.reload();
    await treeNode(page, 'Tree Col').click();
    await treeNode(page, 'Box').click();
    await expect(page.getByTestId('node-Box')).toBeVisible();
    await expect(page.getByTestId('node-Inside Box')).toHaveCount(0);
  });

  test('deleting a folder removes its subfolders and every request inside them', async ({ page }) => {
    await createCollectionUi(page, 'Cascade Col');
    await addViaMenu(page, 'Cascade Col', 'new-request', 'Root Req');
    await addViaMenu(page, 'Cascade Col', 'new-folder', 'Outer');
    await treeNode(page, 'Outer').click();
    await openNodeMenu(page, 'Outer');
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Inner');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Inner')).toBeVisible();
    await treeNode(page, 'Inner').click();
    await openNodeMenu(page, 'Inner');
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Deep Req');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Deep Req')).toBeVisible();

    await openNodeMenu(page, 'Outer');
    await page.getByTestId('action-menu-delete').click();
    const del = page.waitForResponse(r => /\/api\/folders\//.test(r.url()) && r.request().method() === 'DELETE');
    await page.getByTestId('confirm-btn').click();
    expect((await del).status()).toBe(200);
    await expect(page.getByTestId('node-Outer')).toHaveCount(0);

    // Nothing of the subtree is left on the server.
    const api = await apiAs(email);
    const workspaces = await (await api.get('/api/workspaces')).json();
    // Public workspaces of other users are listed too, so pick our own personal one explicitly.
    const me = await (await api.get('/api/auth/me')).json();
    const own = workspaces.find((w: any) => w.isPersonal && String(w.ownerId) === String(me.id));
    const tree = await (await api.get(`/api/workspaces/${own._id}/tree?full=1`)).json();
    expect(tree.folders).toEqual([]);
    expect(tree.requests.map((r: any) => r.name)).toEqual(['Root Req']);
    await api.dispose();
  });

  test('Sort A-Z orders a collection\'s requests by name and the order survives a reload', async ({ page }) => {
    await createCollectionUi(page, 'Sort Col');
    for (const n of ['zeta', 'alpha', 'mid']) await addViaMenu(page, 'Sort Col', 'new-request', n);
    const names = () => page.locator('[data-testid="node-zeta"], [data-testid="node-alpha"], [data-testid="node-mid"]').allTextContents();
    expect(await names()).toEqual(['zeta', 'alpha', 'mid']);

    const reorder = page.waitForResponse(r => r.url().includes('/collections/reorder'));
    await openNodeMenu(page, 'Sort Col');
    await page.getByTestId('action-menu-sort-a-z').click();
    await reorder;
    await expect.poll(names).toEqual(['alpha', 'mid', 'zeta']);

    await page.reload();
    await treeNode(page, 'Sort Col').click();
    await expect.poll(names).toEqual(['alpha', 'mid', 'zeta']);
  });

  test('the sidebar filter narrows collections by request name', async ({ page }) => {
    await createCollectionUi(page, 'Filter One');
    await addViaMenu(page, 'Filter One', 'new-request', 'needle-request');
    await createCollectionUi(page, 'Filter Two');
    await page.getByPlaceholder('Filter requests...').fill('needle');
    await expect(page.getByTestId('node-Filter One')).toBeVisible();
    await expect(page.getByTestId('node-needle-request')).toBeVisible();
    await expect(page.getByTestId('node-Filter Two')).toHaveCount(0);
    await page.getByPlaceholder('Filter requests...').fill('no-such-thing');
    await expect(page.getByText('No results for "no-such-thing"')).toBeVisible();
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

  test('a folder dragged onto another folder moves there and stays after a reload', async ({ page }) => {
    await createCollectionUi(page, 'Drag Col');
    await addViaMenu(page, 'Drag Col', 'new-folder', 'Target');
    await addViaMenu(page, 'Drag Col', 'new-folder', 'Mover');

    const put = page.waitForResponse(r => /\/api\/folders\//.test(r.url()) && r.request().method() === 'PUT');
    await page.dragAndDrop('[data-testid="node-Mover"]', '[data-testid="node-Target"]');
    expect((await put).status()).toBe(200);

    await page.reload();
    await treeNode(page, 'Drag Col').click();
    await expect(page.getByTestId('node-Mover')).toHaveCount(0); // nested, Target is collapsed
    await treeNode(page, 'Target').click();
    await expect(page.getByTestId('node-Mover')).toBeVisible();
  });
});

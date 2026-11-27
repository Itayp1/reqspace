import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu, openNodeMenu, treeNode, apiAs, startNewRequest } from '../helpers';

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
    await startNewRequest(page, 'Box');
    await page.getByTestId('prompt-input').fill('Inside Box');
    await page.getByTestId('prompt-input').press('Enter');
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
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('node-Inner')).toBeVisible();
    await treeNode(page, 'Inner').click();
    await startNewRequest(page, 'Inner');
    await page.getByTestId('prompt-input').fill('Deep Req');
    await page.getByTestId('prompt-input').press('Enter');
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

  test('a folder dragged onto another collection moves there and stays after a reload', async ({ page }) => {
    await createCollectionUi(page, 'Src Col');
    await createCollectionUi(page, 'Dst Col');
    await addViaMenu(page, 'Src Col', 'new-folder', 'Traveler');

    const put = page.waitForResponse(r => /\/api\/folders\//.test(r.url()) && r.request().method() === 'PUT');
    await page.dragAndDrop('[data-testid="node-Traveler"]', '[data-testid="node-Dst Col"]');
    expect((await put).status()).toBe(200);

    await page.reload();
    await treeNode(page, 'Dst Col').click();
    await expect(page.getByTestId('node-Traveler')).toBeVisible();
    await treeNode(page, 'Src Col').click();
    await expect(page.getByTestId('node-Traveler')).toHaveCount(1);
  });

  test('a folder with a subfolder and a request keeps them when dragged to another collection', async ({ page }) => {
    await createCollectionUi(page, 'Src2');
    await createCollectionUi(page, 'Dst2');
    await addViaMenu(page, 'Src2', 'new-folder', 'Parent');
    await treeNode(page, 'Parent').click();
    await openNodeMenu(page, 'Parent');
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Child');
    await page.getByTestId('prompt-input').press('Enter');
    await treeNode(page, 'Child').click();
    await startNewRequest(page, 'Child');
    await page.getByTestId('prompt-input').fill('Deep Req');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('node-Deep Req')).toBeVisible();

    const put = page.waitForResponse(r => /\/api\/folders\//.test(r.url()) && r.request().method() === 'PUT');
    await page.dragAndDrop('[data-testid="node-Parent"]', '[data-testid="node-Dst2"]');
    expect((await put).status()).toBe(200);

    await page.reload();
    await treeNode(page, 'Src2').click();
    await expect(page.getByTestId('node-Parent')).toHaveCount(0);
    await treeNode(page, 'Dst2').click();
    await treeNode(page, 'Parent').click();
    await treeNode(page, 'Child').click();
    await expect(page.getByTestId('node-Deep Req')).toBeVisible();
  });
});

// QA-44: dragging a request onto a sibling request reorders it and the order persists.
test('[QA-44] drag request onto sibling reorders and persists', async ({ page }) => {
  await registerUser(page, 'qa44');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const col = await (await page.request.post(`/api/workspaces/${ws.id ?? ws._id}/collections`, { data: { name: 'Col44' } })).json();
  const cid = col.id ?? col._id;
  for (const [i, name] of ['R-A', 'R-B', 'R-C'].entries()) {
    await page.request.post(`/api/collections/${cid}/requests`, { data: { name, method: 'GET', url: 'https://mock.test/x', order: i } });
  }
  await page.reload();
  await page.getByTestId('node-Col44').click();
  await expect(page.getByTestId('node-R-C')).toBeVisible();

  await page.getByTestId('node-R-C').dragTo(page.getByTestId('node-R-A'));

  await expect(async () => {
    const reqs: any[] = await (await page.request.get(`/api/collections/${cid}/requests`)).json();
    expect(reqs.sort((a, b) => a.order - b.order).map(r => r.name)).toEqual(['R-C', 'R-A', 'R-B']);
  }).toPass();
});

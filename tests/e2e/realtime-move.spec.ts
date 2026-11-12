import { test, expect } from './fixtures';
import { registerUser, apiAs, treeNode } from './helpers';

/**
 * A move made by one user must show up for everyone else as a move, not a
 * copy. The socket reducers used to add the item to its new parent without
 * taking it out of the old one, so collaborators saw it in both places until
 * they reloaded.
 */
test('a request and a folder moved by a teammate appear once, in their new place', async ({ page, browser }) => {
  const ts = Date.now();
  // User B (the observer) uses the page; User A works through the API.
  const emailB = await registerUser(page, 'move_observer', 'Observer');
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const emailA = await registerUser(pageA, 'move_actor', 'Actor');
  await ctxA.close();

  const a = await apiAs(emailA);
  const ws = await (await a.post('/api/workspaces', { data: { name: `Move WS ${ts}` } })).json();
  expect((await a.post(`/api/workspaces/${ws._id}/members`, { data: { email: emailB, role: 'editor' } })).status()).toBe(201);
  const col = await (await a.post(`/api/workspaces/${ws._id}/collections`, { data: { name: 'Move Col' } })).json();
  const from = await (await a.post(`/api/collections/${col._id}/folders`, { data: { name: 'From Folder' } })).json();
  const to = await (await a.post(`/api/collections/${col._id}/folders`, { data: { name: 'To Folder' } })).json();
  const sub = await (await a.post(`/api/collections/${col._id}/folders`, { data: { name: 'Sub Folder', parentFolderId: from._id } })).json();
  const req = await (await a.post(`/api/collections/${col._id}/requests`, { data: { name: 'Traveller', method: 'GET', url: 'https://move.example.test', folderId: from._id } })).json();

  await page.reload();
  await page.getByTestId('workspace-select').selectOption(ws._id);
  await treeNode(page, 'Move Col').click();
  await treeNode(page, 'From Folder').click();
  await treeNode(page, 'To Folder').click();
  await expect(page.getByTestId('node-Traveller')).toHaveCount(1);
  await expect(page.getByTestId('node-Sub Folder')).toHaveCount(1);

  // Move the request; the observer sees it leave one folder and enter the other.
  expect((await a.put(`/api/requests/${req._id}`, { data: { folderId: to._id } })).status()).toBe(200);
  // The innermost subtree wrapper that holds the To Folder row (the
  // collection's wrapper contains it too, and comes first in the DOM).
  const toFolder = page.locator('div.select-none', { has: page.getByTestId('node-To Folder') }).last();
  await expect(toFolder.getByTestId('node-Traveller')).toBeVisible();
  await expect(page.getByTestId('node-Traveller')).toHaveCount(1);

  // Same for a folder.
  expect((await a.put(`/api/folders/${sub._id}`, { data: { parentFolderId: to._id } })).status()).toBe(200);
  await expect(toFolder.getByTestId('node-Sub Folder')).toBeVisible();
  await expect(page.getByTestId('node-Sub Folder')).toHaveCount(1);
  await a.dispose();
});

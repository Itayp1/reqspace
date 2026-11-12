import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// Global Search: picking a collection/folder result must reveal it in the tree and close the modal.
test('[global-search] picking a nested folder expands the tree to it', async ({ page }) => {
  await registerUser(page, 'gsreveal', 'Search Reveal');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const col = await (await page.request.post(`/api/workspaces/${ws.id ?? ws._id}/collections`, { data: { name: 'ColReveal' } })).json();
  const cid = col.id ?? col._id;
  const outer = await (await page.request.post(`/api/collections/${cid}/folders`, { data: { name: 'OuterReveal' } })).json();
  await page.request.post(`/api/collections/${cid}/folders`, { data: { name: 'InnerReveal', parentFolderId: outer.id ?? outer._id } });
  await page.reload();

  // Load the tree (search only sees loaded children), then collapse everything again.
  await page.getByTestId('node-ColReveal').click();
  await page.getByTestId('node-OuterReveal').click();
  await expect(page.getByTestId('node-InnerReveal')).toBeVisible();
  await page.getByTestId('node-ColReveal').click();
  await expect(page.getByTestId('node-OuterReveal')).toBeHidden();

  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Global search' });
  await dialog.getByRole('combobox').fill('InnerReveal');
  await dialog.getByRole('option', { name: 'folder: InnerReveal' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('node-InnerReveal')).toBeVisible();

  // A collection result re-opens a collapsed collection.
  await page.getByTestId('node-ColReveal').click();
  await expect(page.getByTestId('node-OuterReveal')).toBeHidden();
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Global search' }).getByRole('combobox').fill('ColReveal');
  await page.getByRole('option', { name: 'collection: ColReveal' }).click();
  await expect(page.getByTestId('node-OuterReveal')).toBeVisible();
});

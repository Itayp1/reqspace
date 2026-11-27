import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { startNewRequest, selectWorkspace, expectWorkspaceListed, registerUser, apiAs, openNodeMenu, treeNode } from '../helpers';

/**
 * Three collection context-menu actions that had no coverage: View
 * Documentation, Copy to Workspace (for both a collection and a single
 * request) and Export. collection.spec.ts covers create/rename/delete/move;
 * these are the ones that were left.
 */
test.describe('Collection Actions', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const EMAIL = `colact_${ts}@example.com`;
  const SOURCE_WS = `Source WS ${ts}`;
  const TARGET_WS = `Target WS ${ts}`;
  const COLLECTION = `Docs Collection ${ts}`;

  function menuFor(page: import('@playwright/test').Page, nodeName: string) {
    return page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${nodeName}`) });
  }

  async function openMenu(page: import('@playwright/test').Page, nodeName: string) {
    const node = menuFor(page, nodeName);
    await node.hover();
    await node.getByTestId('action-menu-btn').click();
  }

  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(EMAIL);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }

  test('set up two workspaces and a documented collection', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Collection User');
    await page.getByTestId('register-email').fill(EMAIL);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    for (const name of [TARGET_WS, SOURCE_WS]) {
      await page.getByTestId('new-workspace-btn').click();
      await page.getByTestId('prompt-input').fill(name);
      await page.getByTestId('prompt-submit').click();
      await expectWorkspaceListed(page, name);
    }
    // The last one created is the active one — build the collection there.
    await expectWorkspaceListed(page, SOURCE_WS);

    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill(COLLECTION);
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();

    await openMenu(page, COLLECTION);
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Nested Folder');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('node-Nested Folder')).toBeVisible();

    // One request at the collection root, with a header and a raw body so the
    // generated docs have something to render beyond the URL.
    await startNewRequest(page, COLLECTION);
    await page.getByTestId('prompt-input').fill('Root Request');
    await page.getByTestId('prompt-input').press('Enter');
    await page.getByTestId('node-Root Request').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('https://api.example.com/v1/root');
    await page.getByTestId('req-tab-headers').click();
    await page.getByTestId('kv-key-0').fill('X-Documented');
    await page.getByTestId('kv-val-0').fill('header-value');
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    // And one inside the folder, to prove the docs walk nested levels.
    await startNewRequest(page, 'Nested Folder');
    await page.getByTestId('prompt-input').fill('Nested Request');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('prompt-input')).toBeHidden();
    // Creating inside a folder auto-expands it.
    const nested = page.getByTestId('node-Nested Request');
    await expect(nested).toBeVisible();
    await nested.click();
    await page.getByTestId('request-url-input').fill('https://api.example.com/v1/nested');
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();
  });

  test('View Documentation renders every request, including nested ones', async ({ page }) => {
    await login(page);
    await selectWorkspace(page, { label: SOURCE_WS });
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();

    await openMenu(page, COLLECTION);
    await page.getByTestId('action-menu-view-documentation').click();

    const modal = page.getByTestId('documentation-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(`${COLLECTION} Documentation`);

    // The docs force-load the tree themselves, so nothing had to be expanded
    // in the sidebar first.
    const root = page.getByTestId('doc-request-Root Request');
    await expect(root).toContainText('POST');
    await expect(root).toContainText('https://api.example.com/v1/root');
    await expect(root).toContainText('X-Documented');
    await expect(root).toContainText('header-value');

    await expect(page.getByTestId('doc-folder-Nested Folder')).toBeVisible();
    await expect(page.getByTestId('doc-request-Nested Request')).toContainText('https://api.example.com/v1/nested');

    await page.getByTestId('documentation-close-btn').click();
    await expect(modal).toBeHidden();
  });

  test('Copy to Workspace copies a collection into another workspace', async ({ page }) => {
    await login(page);
    await selectWorkspace(page, { label: SOURCE_WS });
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();

    // duplicateCollection copies what the store has loaded, so expand the
    // collection and its folder first — otherwise the copy comes out empty.
    await page.getByTestId(`node-${COLLECTION}`).click();
    await expect(page.getByTestId('node-Root Request')).toBeVisible();
    await page.getByTestId('node-Nested Folder').click();
    await expect(page.getByTestId('node-Nested Request')).toBeVisible();

    await openMenu(page, COLLECTION);
    await page.getByTestId('action-menu-copy-to-workspace').click();
    const modal = page.getByTestId('copy-to-workspace-modal');
    await expect(modal).toBeVisible();
    // A collection copy picks a workspace only; there's no target-collection
    // select for it.
    await expect(page.getByTestId('copy-target-collection-select')).toBeHidden();

    await page.getByTestId('copy-target-workspace-select').selectOption({ label: TARGET_WS });
    await page.getByTestId('copy-submit-btn').click();
    await expect(modal).toBeHidden();

    // The original stays put...
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();

    // ...and a "Copy of" collection is in the target workspace, carrying both
    // the root request and the folder with its own request.
    await selectWorkspace(page, { label: TARGET_WS });
    const copied = page.getByTestId(`node-Copy of ${COLLECTION}`);
    await expect(copied).toBeVisible();
    await copied.click();
    await expect(page.getByTestId('node-Root Request')).toBeVisible();
    await page.getByTestId('node-Nested Folder').click();
    await expect(page.getByTestId('node-Nested Request')).toBeVisible();
  });

  test('Copy to Workspace copies a single request into a chosen collection', async ({ page }) => {
    await login(page);
    await selectWorkspace(page, { label: SOURCE_WS });
    await page.getByTestId(`node-${COLLECTION}`).click();
    await expect(page.getByTestId('node-Root Request')).toBeVisible();

    await openMenu(page, 'Root Request');
    await page.getByTestId('action-menu-copy-to-workspace').click();
    const modal = page.getByTestId('copy-to-workspace-modal');
    await expect(modal).toBeVisible();

    // A request copy needs a destination collection as well as a workspace.
    await page.getByTestId('copy-target-workspace-select').selectOption({ label: SOURCE_WS });
    await expect(page.getByTestId('copy-target-collection-select')).toBeVisible();
    await page.getByTestId('copy-target-collection-select').selectOption({ label: COLLECTION });
    await page.getByTestId('copy-submit-btn').click();
    await expect(modal).toBeHidden();

    // Copies land at the collection root under a "(Copy)" name. The
    // collection is already expanded from the start of this test, so the new
    // row should just appear — don't click the collection again, that would
    // collapse it.
    await expect(page.getByTestId('node-Root Request (Copy)')).toBeVisible();
  });

  test('Export downloads the collection as JSON with its requests', async ({ page }) => {
    await login(page);
    await selectWorkspace(page, { label: SOURCE_WS });
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();

    await openMenu(page, COLLECTION);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('action-menu-export').click();
    const download = await downloadPromise;

    const fs = require('fs');
    const dump = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    const serialised = JSON.stringify(dump);
    expect(serialised).toContain(COLLECTION);
    expect(serialised).toContain('Root Request');
    expect(serialised).toContain('https://api.example.com/v1/root');
    expect(serialised).toContain('Nested Request');
  });
});

test.describe('Collection documentation and Copy to Workspace (UI)', () => {
  test.use({ allowFpErrors: [/Network Error/] });

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const idOf = (o: any): string => o.id ?? o._id;

  async function seedTreeUser(page: Page, prefix: string) {
    const email = await registerUser(page, prefix);
    const api = await apiAs(email);
    const wsList = await (await api.get('/api/workspaces')).json();
    const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
    return { email, api, wsId: idOf(ws) };
  }

  const tabs = (page: Page, text: string) => page.locator('[data-testid^="tab-"]').filter({ hasText: text });
  const menuItem = (page: Page, re: RegExp) => page.locator('[data-testid^="action-menu-"]', { hasText: re }).first();

  test('[C9.5] collection documentation masks tokens and secrets until revealed', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c95');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C95' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, {
      data: { name: 'Secret req', method: 'GET', url: 'https://s.test', headers: [{ key: 'Authorization', value: 'Bearer SUPERSECRETTOKEN123', enabled: true }] },
    });
    await page.reload();
    await openNodeMenu(page, 'C95');
    await menuItem(page, /documentation/i).click();
    const modal = page.getByTestId('documentation-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('doc-request-Secret req')).toBeVisible();
    await expect(modal).not.toContainText('SUPERSECRETTOKEN123');
    await modal.getByTestId('doc-reveal-btn').first().click();
    await expect(modal).toContainText('SUPERSECRETTOKEN123');
  });

  test('[C10.5] a failure part-way through Copy to Workspace leaves no partial collection', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c105');
    const target = await (await api.post('/api/workspaces', { data: { name: uniq('Target') } })).json();
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C105' } })).json();
    for (const n of ['r1', 'r2', 'r3']) {
      await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: n, method: 'GET', url: `https://${n}.test` } });
    }
    await page.reload();
    let posts = 0;
    await page.route(/\/api\/collections\/[^/]+\/requests$/, async route => {
      if (route.request().method() === 'POST' && ++posts === 2) return route.abort('failed');
      return route.continue();
    });
    await openNodeMenu(page, 'C105');
    await menuItem(page, /copy to/i).click();
    await page.getByTestId('copy-target-workspace-select').selectOption(idOf(target));
    await page.getByRole('button', { name: /^copy$/i }).click();
    await page.waitForTimeout(1500);
    const cols = await (await api.get(`/api/workspaces/${idOf(target)}/collections`)).json();
    expect(cols.length, 'partial collection left in target').toBe(0);
  });

  test('[C10.6] Copy to Workspace dialog says variables/environments are not copied', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c106');
    await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C106' } });
    await page.reload();
    await openNodeMenu(page, 'C106');
    await menuItem(page, /copy to/i).click();
    await expect(page.getByTestId('copy-to-workspace-modal')).toContainText(/environments?.*not copied/i);
  });
});

test.describe('Copy to Workspace as a viewer', () => {
  test('[D10.3] a viewer with an empty personal workspace can copy a request there (default writable target, auto collection)', async ({ page, browser }) => {
    const ownerEmail = await registerUser(page, 'd103o');
    const ctxV = await browser.newContext();
    const pageV = await ctxV.newPage();
    const viewerEmail = await registerUser(pageV, 'd103v');
    const owner = await apiAs(ownerEmail);
    const ws = await (await owner.post('/api/workspaces', { data: { name: `D103 ${Date.now()}` } })).json();
    const wsId = ws.id ?? ws._id;
    const col = await (await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'D103Col' } })).json();
    const r = await owner.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'D103Req', method: 'GET', url: 'http://localhost/x', folderId: null } });
    expect(r.ok(), await r.text()).toBeTruthy();
    expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).ok()).toBeTruthy();

    await pageV.reload();
    await selectWorkspace(pageV, wsId);
    await pageV.getByTestId('node-D103Col').click();
    await expect(treeNode(pageV, 'D103Req')).toBeVisible();
    await openNodeMenu(pageV, 'D103Req');
    await pageV.getByTestId('action-menu-copy-to-workspace').click();
    const modal = pageV.getByTestId('copy-to-workspace-modal');
    await expect(modal).toBeVisible();
    await expect(pageV.getByTestId('copy-target-workspace-select')).not.toHaveValue(wsId);
    await pageV.getByTestId('copy-submit-btn').click();
    await expect(modal).toBeHidden({ timeout: 10000 });

    const vctx = await apiAs(viewerEmail);
    const wss = await (await vctx.get('/api/workspaces')).json();
    const list = Array.isArray(wss) ? wss : wss.workspaces;
    const personal = list.find((w: any) => w.isPersonal);
    const cols = await (await vctx.get(`/api/workspaces/${personal.id ?? personal._id}/collections`)).json();
    expect(cols.length).toBeGreaterThan(0);
    await ctxV.close();
  });
});

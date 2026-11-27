import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { registerUser, createCollectionUi, addViaMenu, openNodeMenu, treeNode, apiAs, startNewRequest, selectWorkspace } from '../helpers';

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

test.describe('Tree tabs, filter and duplicate (UI)', () => {
  test.use({ allowFpErrors: [/Network Error/] });

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

  test('[C2.4] renaming a request in the tree updates its open tab title', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c24');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C24' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'OldReq', method: 'GET', url: 'https://c24.test' } });
    await page.reload();
    await treeNode(page, 'C24').click();
    await page.getByTestId('node-OldReq').click();
    await expect(tabs(page, 'OldReq')).toHaveCount(1);
    await treeNode(page, 'OldReq').dblclick();
    await page.getByTestId('inline-rename-input').fill('NewReq');
    await page.getByTestId('inline-rename-input').press('Enter');
    await expect(page.getByTestId('node-NewReq')).toBeVisible();
    await expect(tabs(page, 'NewReq')).toHaveCount(1);
    await expect(tabs(page, 'OldReq')).toHaveCount(0);
  });

  test('[C3.1] deleting a request closes (or marks) its open tab, so Save cannot 404', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c31');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C31' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'Doomed', method: 'GET', url: 'https://c31.test' } });
    await page.reload();
    await treeNode(page, 'C31').click();
    await page.getByTestId('node-Doomed').click();
    await expect(tabs(page, 'Doomed')).toHaveCount(1);
    await openNodeMenu(page, 'Doomed');
    await menuItem(page, /delete/i).click();
    await page.getByTestId('confirm-btn').click();
    await expect(page.getByTestId('node-Doomed')).toHaveCount(0);
    await expect(tabs(page, 'Doomed')).toHaveCount(0);
  });

  test('[C7.1] filter shows the matching request inside an auto-opened folder, and nothing unrelated', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c71');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C71' } })).json();
    const folder = await (await api.post(`/api/collections/${idOf(col)}/folders`, { data: { name: 'F1' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'copy me', method: 'GET', url: 'https://a.test', folderId: idOf(folder) } });
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'Health', method: 'GET', url: 'https://health.test' } });
    await page.reload();
    await page.getByPlaceholder('Filter requests...').fill('copy');
    await expect(page.getByTestId('node-copy me')).toBeVisible();
    await expect(page.getByTestId('node-Health')).toHaveCount(0);
  });

  test('[C7.2] tree filter is case-insensitive', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c72');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C72' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'lowercasereq', method: 'GET', url: 'https://l.test' } });
    await page.reload();
    await page.getByPlaceholder('Filter requests...').fill('LOWERCASE');
    await expect(page.getByTestId('node-lowercasereq')).toBeVisible();
  });

  test('[C7.6] typing in the filter of a large tree stays responsive (<200ms per keystroke)', async ({ page }) => {
    test.setTimeout(240_000);
    const { api, wsId } = await seedTreeUser(page, 'c76');
    const items = Array.from({ length: 2000 }, (_, i) => ({ name: `bulk request ${i}`, request: { method: 'GET', url: { raw: `https://bulk.test/${i}` } } }));
    const imp = await api.post('/api/collections/import', {
      data: { workspaceId: wsId, collection: { info: { name: 'Big', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: items } },
    });
    expect(imp.ok(), await imp.text()).toBeTruthy();
    await page.reload();
    await treeNode(page, 'Big').click();
    await expect(page.getByTestId('node-bulk request 5')).toBeVisible();
    const lat = await page.evaluate(async () => {
      const el = document.querySelector('input[placeholder="Filter requests..."]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const times: number[] = [];
      let v = '';
      for (const ch of 'bulk req') {
        v += ch;
        const t0 = performance.now();
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
        times.push(performance.now() - t0);
        await new Promise(r => setTimeout(r, 250));
      }
      return times;
    });
    const max = Math.max(...lat);
    expect(max, `latencies ${lat.map(x => Math.round(x)).join(',')}`).toBeLessThan(200);
  });

  test('[C10.4] duplicating a request twice yields distinct names', async ({ page }) => {
    const { api, wsId } = await seedTreeUser(page, 'c104');
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C104' } })).json();
    await api.post(`/api/collections/${idOf(col)}/requests`, { data: { name: 'GetUser', method: 'GET', url: 'https://u.test' } });
    await page.reload();
    await treeNode(page, 'C104').click();
    for (let i = 0; i < 2; i++) {
      await openNodeMenu(page, 'GetUser');
      await menuItem(page, /duplicate/i).click();
      await expect(page.locator('[data-testid^="node-GetUser"]')).toHaveCount(i + 2);
    }
    const names = await page.locator('[data-testid^="node-GetUser"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
    expect(new Set(names).size).toBe(names.length);
  });
});

test.describe('Tree operations (API)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }

  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    const body = await res.json();
    return { ctx, email, id: (body.user?.id ?? body.user?._id) as string };
  }

  async function newWorkspace(ctx: APIRequestContext, name = uniq('ws')) {
    const res = await ctx.post('/api/workspaces', { data: { name } });
    expect(res.ok(), 'create workspace').toBeTruthy();
    const ws = await res.json();
    return (ws.id ?? ws._id) as string;
  }


  test('[C2.2] renaming to an empty / whitespace-only name is rejected', async () => {
    const { ctx } = await newUser('c22');
    const wsId = await newWorkspace(ctx);
    const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
    const colId = col.id ?? col._id;
    expect((await ctx.put(`/api/collections/${colId}`, { data: { name: '   ' } })).status()).toBe(400);
    expect((await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: '   ' } })).status()).toBe(400);
  });

  test('[C3.5] deleting a request nested in a folder and one at the root both work', async () => {
    const { ctx } = await newUser('c35');
    const wsId = await newWorkspace(ctx);
    const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
    const colId = col.id ?? col._id;
    const folder = await (await ctx.post(`/api/collections/${colId}/folders`, { data: { name: 'F' } })).json();
    const nested = await (await ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'N', method: 'GET', url: 'http://x', folderId: folder.id ?? folder._id } })).json();
    const root = await (await ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'R', method: 'GET', url: 'http://x' } })).json();
    expect((await ctx.delete(`/api/requests/${nested.id ?? nested._id}`)).status()).toBe(200);
    expect((await ctx.delete(`/api/requests/${root.id ?? root._id}`)).status()).toBe(200);
    expect((await ctx.get(`/api/requests/${nested.id ?? nested._id}`)).status()).toBe(404);
  });
});

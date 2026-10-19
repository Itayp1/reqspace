import { test, expect } from './fixtures';
import { registerUser, loginAdminUi, apiAs, apiAsAdmin, treeNode, openNodeMenu, createCollectionUi } from './helpers';

/**
 * Regression tests for the bugs found in the manual browser pass of 2026-10-14
 * (see BUGS-MANUAL-PASS.md). Each test asserts the CORRECT behaviour and is marked
 * `test.fail()` while the bug is still present, so the suite stays green and the
 * fixer gets a clear signal: once the bug is fixed the test fails with
 * "expected to fail", and the `test.fail()` line must be deleted.
 */

test.describe('Manual-pass bugs (regressions of bugs found by hand)', () => {
  test('BUG-01: the superadmin\'s own workspace is marked personal', async () => {
    const ctx = await apiAsAdmin();
    const body = await (await ctx.get('/api/workspaces')).json();
    const list: Array<{ name: string; isPersonal: boolean }> = Array.isArray(body) ? body : body.workspaces;
    const own = list.find((w) => w.name === "Admin's Workspace");
    expect(own, 'admin workspace exists').toBeTruthy();
    expect(own!.isPersonal).toBe(true);
    await ctx.dispose();
  });

  test('BUG-02: a viewer is not offered editor-only tree actions', async ({ page, browser }) => {
    const ownerEmail = await registerUser(page, 'bugown');
    const owner = await apiAs(ownerEmail);
    const ws = await (await owner.post('/api/workspaces', { data: { name: `Viewer WS ${Date.now()}` } })).json();
    const wsId: string = ws.id ?? ws._id;
    await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Read Only Col' } });

    const viewerCtx = await browser.newContext();
    const viewerPage = await viewerCtx.newPage();
    const viewerEmail = await registerUser(viewerPage, 'bugview');
    const invite = await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } });
    expect(invite.ok()).toBeTruthy();

    await viewerPage.reload();
    await viewerPage.getByTestId('workspace-select').selectOption(wsId);
    await expect(treeNode(viewerPage, 'Read Only Col')).toBeVisible();
    await openNodeMenu(viewerPage, 'Read Only Col');
    await expect(viewerPage.getByTestId('action-menu-new-request')).toHaveCount(0);
    await expect(viewerPage.getByTestId('action-menu-delete')).toHaveCount(0);
    await viewerCtx.close();
    await owner.dispose();
  });

  test('BUG-03: an existing share link is still visible (and revocable) after the dialog is reopened', async ({ page }) => {
    await registerUser(page, 'bugshare');
    await createCollectionUi(page, 'Shared Later');
    await openNodeMenu(page, 'Shared Later');
    await page.getByTestId('action-menu-share-via-link').click();
    await page.getByTestId('share-link-generate-btn').click();
    await expect(page.getByTestId('share-link-result')).toBeVisible();
    await page.getByTestId('share-link-modal').getByRole('button', { name: 'Done' }).click();

    await openNodeMenu(page, 'Shared Later');
    await page.getByTestId('action-menu-share-via-link').click();
    await expect(page.getByTestId('share-link-modal')).toBeVisible();
    // The dialog lists links created earlier ("Active links") and lets the owner revoke them.
    await expect(page.getByTestId('share-link-existing-row')).toHaveCount(1);
    await page.getByTestId('share-link-existing-revoke').click();
    await expect(page.getByTestId('share-link-existing-row')).toHaveCount(0);
  });

  test('BUG-04: SMTP Test Connection with an empty host names the missing field', async ({ page }) => {
    await loginAdminUi(page);
    await page.goto('/admin');
    await page.getByTestId('admin-tab-settings').click();
    const smtp = page.getByTestId('admin-smtp-enabled');
    if (!(await smtp.isChecked())) await smtp.check();
    await page.getByTestId('admin-smtp-host').fill('');
    await page.getByTestId('admin-smtp-test').click();
    await expect(page.getByTestId('toast-error').filter({ hasText: /host/i }).first()).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

/**
 * Two leftovers from the audit:
 *
 *  - GroupEditModal's Test tab. scripts-scope.spec.ts covers the Pre-request
 *    tab at collection and folder level, but collection- and folder-level
 *    *test* scripts (and the way they stack with the request's own) were
 *    never exercised.
 *  - The workspace Activity / Changelog tab, which reads the audit log.
 */
test.describe('Group test scripts & workspace activity', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const EMAIL = `grouptest_${ts}@example.com`;

  function container(page: import('@playwright/test').Page, nodeName: string) {
    return page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${nodeName}`) });
  }

  async function openMenu(page: import('@playwright/test').Page, nodeName: string) {
    const node = container(page, nodeName);
    await node.hover();
    await node.getByTestId('action-menu-btn').click();
  }

  test('collection, folder and request test scripts all run for one request', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Group User');
    await page.getByTestId('register-email').fill(EMAIL);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    await page.route('https://group.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );

    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Group Collection');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Group Collection')).toBeVisible();

    // Collection-level test script.
    await openMenu(page, 'Group Collection');
    await page.getByTestId('action-menu-edit').click();
    await page.getByTestId('group-edit-test-tab').click();
    const colEditor = page.getByTestId('group-test-editor');
    await colEditor.getByTestId('monaco-editor-container').click();
    // Pasted rather than typed: Monaco auto-closes brackets and quotes.
    // pm.response is a plain object in the sandbox (code / status / body) —
    // Postman's pm.response.to.have.status(...) chain isn't implemented, so
    // assert through pm.expect, which is what the sandbox does provide.
    await page.keyboard.insertText(`pm.test('collection-level test', function () { pm.expect(pm.response.code).to.equal(200); });`);
    await expect(colEditor.locator('.view-lines')).toContainText('collection-level test');
    await page.getByTestId('group-edit-save-btn').click();

    // Folder-level test script.
    await openMenu(page, 'Group Collection');
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Group Folder');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Group Folder')).toBeVisible();

    await openMenu(page, 'Group Folder');
    await page.getByTestId('action-menu-edit').click();
    // Folders have no Variables tab, so they open on Pre-request.
    await expect(page.getByTestId('group-edit-variables-tab')).toBeHidden();
    await page.getByTestId('group-edit-test-tab').click();
    const folderEditor = page.getByTestId('group-test-editor');
    await folderEditor.getByTestId('monaco-editor-container').click();
    await page.keyboard.insertText(`pm.test('folder-level test', function () { pm.expect(1).to.eql(1); });`);
    await expect(folderEditor.locator('.view-lines')).toContainText('folder-level test');
    await page.getByTestId('group-edit-save-btn').click();

    // A request in the folder, with its own test script plus one deliberate
    // failure so the pass/fail split is visible.
    await openMenu(page, 'Group Folder');
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Group Request');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('prompt-input')).toBeHidden();
    const reqNode = page.getByTestId('node-Group Request');
    if (!(await reqNode.isVisible().catch(() => false))) {
      await page.getByTestId('node-Group Folder').click();
    }
    await reqNode.click();

    await page.getByTestId('request-url-input').fill('https://group.example.com/thing');
    await page.getByTestId('req-tab-tests').click();
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.insertText(`pm.test('request-level test', function () { pm.expect(2).to.eql(2); });\npm.test('deliberate failure', function () { pm.expect(1).to.eql(2); });`);
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');

    // All three scopes' tests ran, and the failing one is reported as failed.
    await page.getByTestId('response-tab-test_results').click();
    const items = page.getByTestId('test-result-item');
    await expect(items).toHaveCount(4);
    for (const name of ['collection-level test', 'folder-level test', 'request-level test']) {
      const row = items.filter({ hasText: name });
      await expect(row.getByTestId('test-result-status')).toHaveText('PASS');
    }
    const failed = items.filter({ hasText: 'deliberate failure' });
    await expect(failed.getByTestId('test-result-status')).toHaveText('FAIL');
  });

  test('the Activity tab lists audit entries for what the workspace did', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(EMAIL);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();

    await page.getByTestId('workspace-settings-btn').click();
    await expect(page.getByTestId('workspace-general-tab')).toBeVisible();

    await page.getByTestId('workspace-activity-tab').click();
    await expect(page.getByRole('heading', { name: 'Workspace Activity' })).toBeVisible();

    // The previous test created a request in this workspace, so the audit log
    // can't be empty. GET /workspaces/:id/activity filters by targetId =
    // workspace id, so an entry only shows up if the write recorded the
    // workspace — that's exactly what this pins down.
    const entries = page.getByTestId('activity-log-entry');
    const created = entries.filter({ hasText: 'create_request' });
    await expect(created.first()).toBeVisible();
    await expect(created.first()).toContainText('Group User');
    await expect(created.first()).toContainText('Group Request');
    await expect(page.getByText('No recent activity found.')).toBeHidden();

    // The tab switch is reversible and doesn't lose the General tab's fields.
    await page.getByTestId('workspace-general-tab').click();
    await expect(page.getByTestId('workspace-name-input')).toBeVisible();
  });
});

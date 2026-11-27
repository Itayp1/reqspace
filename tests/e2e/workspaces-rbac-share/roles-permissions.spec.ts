import { test, expect, type Page } from '../fixtures';
import { selectWorkspace, activeWorkspaceId, expectWorkspaceListed, openNodeMenu, registerUser, createCollectionUi, addViaMenu, startNewRequest } from '../helpers';
import { makeUser, makeWorkspace } from './invite-helpers';

test.describe('RBAC Roles', () => {
  test('Viewer cannot edit, Editor can edit', async ({ browser }) => {
    const timestamp = Date.now();
    const userAEmail = `user_a_${timestamp}@example.com`;
    const userBEmail = `user_b_${timestamp}@example.com`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // User A Register
    await pageA.goto('/register');
    await pageA.getByTestId('register-name').fill('User A');
    await pageA.getByTestId('register-email').fill(userAEmail);
    await pageA.getByTestId('register-password').fill('password123');
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*\/$/);

    // User B Register
    await pageB.goto('/register');
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(userBEmail);
    await pageB.getByTestId('register-password').fill('password123');
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*\/$/);

    // User A Creates Workspace (custom in-app modal, not a native dialog)
    const wsName = `RBAC WS ${timestamp}`;
    await pageA.getByTestId('new-workspace-btn').click();
    await pageA.getByTestId('prompt-input').fill(wsName);
    await pageA.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(pageA, wsName);
    const workspaceId = await activeWorkspaceId(pageA);

    // User A creates a collection first — the Save modal itself can't create
    // one (its "Save to..." list just says "No collections found" when
    // empty and the submit button stays disabled).
    await pageA.getByTestId('new-collection-empty-btn').click();
    await pageA.getByTestId('prompt-input').fill('Col 1');
    await pageA.getByTestId('prompt-input').press('Enter');
    await expect(pageA.getByTestId('node-Col 1')).toBeVisible();

    // User A creates a request and saves it into that collection
    await pageA.getByTestId('new-tab-btn').click();
    await pageA.getByTestId('request-url-input').fill('https://example.com');
    await pageA.getByTestId('request-save-btn').click();
    await pageA.getByTestId('save-req-name-input').fill('Test Request');
    await pageA.getByTestId('save-req-submit-btn').click();
    await expect(pageA.getByTestId('save-req-name-input')).toBeHidden();
    // Save opens the target collection. A click on the row toggles it shut.
    await expect(pageA.getByTestId('node-Test Request')).toBeVisible();

    // User A invites User B as Viewer
    await pageA.getByTestId('workspace-settings-btn').click();
    await pageA.getByTestId('workspace-members-tab').click();
    await pageA.getByTestId('user-autocomplete-input').fill(userBEmail);
    await pageA.getByTestId('workspace-invite-role').selectOption('viewer');
    await pageA.getByTestId('workspace-invite-btn').click();
    await expect(pageA.getByTestId('invite-email').filter({ hasText: userBEmail })).toBeVisible();
    await pageA.getByTestId('close-workspace-modal').click();

    // User B refreshes and switches to workspace
    await pageB.reload();
    await selectWorkspace(pageB, workspaceId);
    await expectWorkspaceListed(pageB, wsName);

    // User B opens the request. A fresh page load starts every collection
    // collapsed, so it has to be expanded before its request is in the DOM.
    await expect(pageB.getByTestId('node-Col 1')).toBeVisible();
    await pageB.getByTestId('node-Col 1').click();
    await pageB.getByTestId('node-Test Request').click();

    // User B verifies Save button is not visible (viewers can't edit)
    await expect(pageB.getByTestId('request-save-btn')).not.toBeVisible();

    // User A changes role to Editor
    await pageA.getByTestId('workspace-settings-btn').click();
    await pageA.getByTestId('workspace-members-tab').click();
    const row = pageA.locator('[data-testid="member-row"]', { has: pageA.locator(`[data-testid="member-email"]:has-text("${userBEmail}")`) });
    const roleUpdated = pageA.waitForResponse(
      (r) => r.url().includes('/members/') && r.request().method() === 'PUT' && r.ok(),
    );
    await row.locator('[data-testid="member-role-select"]').selectOption('editor');
    await roleUpdated;
    await pageA.getByTestId('close-workspace-modal').click();

    // User B reloads
    await pageB.reload();
    await selectWorkspace(pageB, workspaceId);
    await expect(pageB.getByTestId('node-Col 1')).toBeVisible();
    await pageB.getByTestId('node-Col 1').click();
    await pageB.getByTestId('node-Test Request').click();

    // User B should now see the Save button
    await expect(pageB.getByTestId('request-save-btn')).toBeVisible();
  });
});

// QA-47: a viewer saw an editable request editor with no hint that it is read-only.
test('a viewer gets a read-only URL bar and a "View only" note', async ({ page }) => {
  await registerUser(page, 'qa47');
  await createCollectionUi(page, 'QA47 Col');
  await addViaMenu(page, 'QA47 Col', 'new-request', 'QA47 Req');

  // Serve the workspace list as if this user were only a viewer of it.
  await page.route(/\/api\/workspaces$/, async (route) => {
    const res = await route.fetch();
    const list = await res.json();
    await route.fulfill({ response: res, json: list.map((w: any) => ({ ...w, myRole: 'viewer' })) });
  });
  await page.reload();
  await page.getByTestId('node-QA47 Col').click();
  await page.getByTestId('node-QA47 Req').click();

  await expect(page.getByTestId('view-only-note')).toBeVisible();
  await expect(page.getByTestId('request-url-input')).toHaveAttribute('readonly', '');
});

test.describe('Permission toast', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  // distinctly from a 401 (not logged in at all). Previously a 403 fell
  // through the axios interceptor silently — the action just didn't happen
  // and the UI said nothing. CollectionExplorer never hides the rename
  // action based on role (there is no client-side role check there at all —
  // verified: `grep -n "myRole\|canEdit" CollectionExplorer.tsx` returns
  // nothing), so a viewer really can reach a PUT the server will 403 — this
  // isn't a synthetic scenario.
  test('a viewer attempting an editor-only action sees an explicit permission message', async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const contextViewer = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const pageViewer = await contextViewer.newPage();

    const timestamp = Date.now();
    const ownerEmail = `owner_${timestamp}@example.com`;
    const viewerEmail = `viewer_${timestamp}@example.com`;
    const viewerName = `Viewer${timestamp}`;
    const password = 'password123';

    await pageOwner.goto('/register');
    await pageOwner.getByTestId('register-name').fill('Owner');
    await pageOwner.getByTestId('register-email').fill(ownerEmail);
    await pageOwner.getByTestId('register-password').fill(password);
    await pageOwner.getByTestId('register-submit').click();
    await expect(pageOwner).toHaveURL(/.*\/$/);

    await pageViewer.goto('/register');
    await pageViewer.getByTestId('register-name').fill(viewerName);
    await pageViewer.getByTestId('register-email').fill(viewerEmail);
    await pageViewer.getByTestId('register-password').fill(password);
    await pageViewer.getByTestId('register-submit').click();
    await expect(pageViewer).toHaveURL(/.*\/$/);

    // Owner creates a workspace and a collection, invites the viewer as viewer.
    const wsName = `Perm WS ${timestamp}`;
    await pageOwner.getByTestId('new-workspace-btn').click();
    await pageOwner.getByTestId('prompt-input').fill(wsName);
    await pageOwner.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(pageOwner, wsName);

    await pageOwner.getByTestId('new-collection-empty-btn').click();
    await pageOwner.getByTestId('prompt-input').fill('Perm Collection');
    await pageOwner.getByTestId('prompt-input').press('Enter');
    await expect(pageOwner.getByTestId('node-Perm Collection').first()).toBeVisible();

    await pageOwner.getByTestId('workspace-settings-btn').click();
    await pageOwner.getByTestId('workspace-members-tab').click();
    await pageOwner.getByTestId('user-autocomplete-input').fill(viewerEmail);
    await pageOwner.getByTestId('workspace-invite-btn').click();
    await expect(pageOwner.getByTestId('invite-email').filter({ hasText: viewerEmail })).toBeVisible();
    await pageOwner.getByTestId('close-workspace-modal').click();

    // The UI now hides editor-only actions from viewers, so to still exercise the
    // server's 403 handling, make the client believe the viewer is an editor.
    await pageViewer.route('**/api/workspaces', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const resp = await route.fetch();
      const list = await resp.json();
      await route.fulfill({ response: resp, json: Array.isArray(list) ? list.map((w: any) => ({ ...w, myRole: 'editor' })) : list });
    });
    // Viewer switches into the workspace.
    await pageViewer.reload();
    await expectWorkspaceListed(pageViewer, wsName);
    // CollectionExplorer's `useEffect(() => fetchCollectionsData(activeWorkspace._id), [activeWorkspace?._id])`
    // fires once on mount for the default workspace, and again on switch —
    // fetchCollectionsData applies whichever response lands last with no
    // guard against a stale one overwriting a fresher one. Selecting the
    // target workspace before the mount fetch has settled lets the two race,
    // and the app's own default (workspaces[0]) losing the race silently
    // clobbers "Perm WS" with an unrelated empty workspace's data — a real,
    // separate bug (not fixed here). Wait for the mount fetch's own settle
    // signal first so there is only ever one fetch in flight at a time.
    await expect(pageViewer.getByText(/no collections yet/i).or(pageViewer.getByTestId('node-container').first())).toBeVisible();
    await selectWorkspace(pageViewer, { label: wsName });
    await expect(pageViewer.getByTestId('node-Perm Collection').first()).toBeVisible();

    // Viewer right-clicks the collection and renames it — the UI never hides
    // this for a viewer; the server is the only thing that says no.
    await pageViewer.getByTestId('node-Perm Collection').first().click({ button: 'right' });
    await pageViewer.getByTestId('context-menu-item').filter({ hasText: 'Rename' }).click();
    await pageViewer.locator('input').last().fill('Renamed By Viewer');
    await pageViewer.keyboard.press('Enter');

    await expect(pageViewer.getByTestId('toast-error')).toBeVisible({ timeout: 5000 });
    // routes/collections.ts's checkPermission -> requireWorkspaceRole produces
    // "Requires editor role (your role: viewer)" for a 403 — assert on that
    // real server message rather than assuming generic "permission" wording.
    await expect(pageViewer.getByTestId('toast-error')).toContainText(/requires editor role/i);

    await contextOwner.close();
    await contextViewer.close();
  });
});

test.describe('Viewer fork offer', () => {
  const ts = Date.now();

  async function register(page: Page, name: string, email: string) {
    await page.goto('/register');
    await page.getByTestId('register-name').fill(name);
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 15000 });
  }

  test('a viewer pressing Ctrl+S is offered a copy into their own workspace', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await register(owner, 'Fork Owner', `forkowner_${ts}@example.com`);
    const workspaceId = await activeWorkspaceId(owner);

    await owner.getByTestId('new-collection-empty-btn').click();
    await owner.getByTestId('prompt-input').fill('Viewer Collection');
    await owner.getByTestId('prompt-input').press('Enter');
    const col = owner.locator('[data-testid="node-container"]', { has: owner.getByTestId('node-Viewer Collection') });
    await expect(col).toBeVisible();
    await col.hover();
    await startNewRequest(owner, col);
    await owner.getByTestId('prompt-input').fill('Viewer Request');
    await owner.getByTestId('prompt-input').press('Enter');
    await expect(owner.getByTestId('node-Viewer Request')).toBeVisible();

    const viewerEmail = `forkviewer_${ts}@example.com`;
    const viewerCtx = await browser.newContext();
    const viewer = await viewerCtx.newPage();
    await register(viewer, 'Fork Viewer', viewerEmail);

    await owner.getByTestId('workspace-settings-btn').click();
    await owner.getByTestId('workspace-members-tab').click();
    await owner.getByTestId('user-autocomplete-input').fill(viewerEmail);
    await owner.getByTestId('workspace-invite-role').selectOption('viewer');
    await owner.getByTestId('workspace-invite-btn').click();
    await expect(owner.getByTestId('invite-email').filter({ hasText: viewerEmail })).toBeVisible();
    await owner.getByTestId('close-workspace-modal').click();

    await viewer.reload();
    await selectWorkspace(viewer, workspaceId);
    await expect(viewer.getByTestId('node-Viewer Collection')).toBeVisible();
    await viewer.getByTestId('node-Viewer Collection').click();
    await viewer.getByTestId('node-Viewer Request').click();

    // Viewers get no Save button at all, so the shortcut is the only route
    // into this modal.
    await expect(viewer.getByTestId('request-save-btn')).toBeHidden();
    await viewer.keyboard.press('Control+s');

    const modal = viewer.getByTestId('viewer-fork-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Permission Denied');

    // Cancel leaves everything alone.
    await viewer.getByTestId('viewer-fork-cancel').click();
    await expect(modal).toBeHidden();

    // Accepting hands over to the Copy to Workspace modal, pre-set to this
    // request.
    await viewer.keyboard.press('Control+s');
    await viewer.getByTestId('viewer-fork-copy').click();
    await expect(viewer.getByTestId('copy-to-workspace-modal')).toBeVisible();
    await expect(viewer.getByTestId('copy-target-collection-select')).toBeVisible();

    await ownerCtx.close();
    await viewerCtx.close();
  });
});

test.describe('Viewer demotion and tree menu', () => {
  const menuItem = (page: Page, re: RegExp) => page.locator('[data-testid^="action-menu-"]', { hasText: re }).first();

  test.describe('tree menu for a viewer', () => {
    test.use({ allowFpErrors: [/Network Error/] });

    test('[C1.8] a viewer is not offered editing actions in the tree menu', async ({ page }) => {
      const owner = await makeUser('c18o');
      const viewerEmail = await registerUser(page, 'c18v');
      const wsId = await makeWorkspace(owner.ctx);
      expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).status()).toBe(201);
      await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'ViewerCol' } });
      await page.reload();
      await selectWorkspace(page, wsId);
      await expect(page.getByTestId('node-ViewerCol')).toBeVisible();
      await openNodeMenu(page, 'ViewerCol');
      for (const re of [/new request/i, /new folder/i, /rename/i, /delete/i, /duplicate/i]) {
        await expect(menuItem(page, re), String(re)).toHaveCount(0);
      }
    });
  });

  test.describe('API', () => {
    // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
    test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

    test('[D6.2] after a viewer-demotion, writes answer 403 immediately', async () => {
      const owner = await makeUser('d62o');
      const member = await makeUser('d62m');
      const wsId = await makeWorkspace(owner.ctx);
      await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: member.email, role: 'editor' } });
      const col = await (await owner.ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
      const colId = col.id ?? col._id;
      expect((await member.ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'ok', method: 'GET', url: 'http://x' } })).status()).toBe(201);
      await owner.ctx.put(`/api/workspaces/${wsId}/members/${member.id}`, { data: { role: 'viewer' } });
      expect((await member.ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'no', method: 'GET', url: 'http://x' } })).status()).toBe(403);
    });
  });
});

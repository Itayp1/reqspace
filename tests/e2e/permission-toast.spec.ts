import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD } from './global-setup';

// UI-3: a 403 (forbidden — logged in, but not allowed) must be handled
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
  const password = 'password123';

  await pageOwner.goto('/register');
  await pageOwner.getByTestId('register-name').fill('Owner');
  await pageOwner.getByTestId('register-email').fill(ownerEmail);
  await pageOwner.getByTestId('register-password').fill(password);
  await pageOwner.getByTestId('register-submit').click();
  await expect(pageOwner).toHaveURL(/.*\/$/);

  await pageViewer.goto('/register');
  await pageViewer.getByTestId('register-name').fill('Viewer');
  await pageViewer.getByTestId('register-email').fill(viewerEmail);
  await pageViewer.getByTestId('register-password').fill(password);
  await pageViewer.getByTestId('register-submit').click();
  await expect(pageViewer).toHaveURL(/.*\/$/);

  // Owner creates a workspace and a collection, invites the viewer as viewer.
  const wsName = `Perm WS ${timestamp}`;
  await pageOwner.getByTestId('new-workspace-btn').click();
  await pageOwner.getByTestId('prompt-input').fill(wsName);
  await pageOwner.getByTestId('prompt-submit').click();
  await expect(pageOwner.getByTestId('workspace-select')).toContainText(wsName);

  await pageOwner.getByTestId('new-collection-empty-btn').click();
  await pageOwner.getByTestId('prompt-input').fill('Perm Collection');
  await pageOwner.getByTestId('prompt-submit').click();
  await expect(pageOwner.getByTestId('node-Perm Collection').first()).toBeVisible();

  await pageOwner.getByTestId('workspace-settings-btn').click();
  await pageOwner.getByTestId('workspace-members-tab').click();
  // Search by name, not email: UserRepository.search's escapeLike escapes
  // '_' as '\_' for a Sequelize Op.like, which only means anything to a LIKE
  // clause with an explicit ESCAPE '\' — Postgres/MySQL default to that,
  // SQLite does not, so any query containing '_' (as this email does) never
  // matches on SQLite. Verified directly against a live SQLite-backed
  // server. Real, separate bug — filed, not fixed, as FIX-8.
  await pageOwner.getByTestId('user-autocomplete-input').fill('Viewer');
  await pageOwner.getByTestId('user-autocomplete-result').first().click();
  await pageOwner.getByTestId('workspace-invite-btn').click();
  await expect(pageOwner.getByTestId('member-email').filter({ hasText: viewerEmail })).toBeVisible();
  await pageOwner.getByTestId('close-workspace-modal').click();

  // Viewer switches into the workspace.
  await pageViewer.reload();
  await expect(pageViewer.getByTestId('workspace-select')).toContainText(wsName);
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
  await pageViewer.getByTestId('workspace-select').selectOption({ label: wsName });
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

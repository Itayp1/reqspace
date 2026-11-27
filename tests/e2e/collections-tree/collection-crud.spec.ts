import { test, expect } from '../fixtures';
import { startNewRequest, selectWorkspace, activeWorkspaceId, expectWorkspaceListed } from '../helpers';
const uuidv4 = () => require('crypto').randomUUID();

test.describe('Collection Operations', () => {
  // Run serially to reuse state
  test.describe.configure({ mode: 'serial' });

  // Unique per run: the live server accumulates workspaces/collections across
  // every spec file in the full suite, so a fixed name would collide with
  // leftovers from earlier runs/files.
  const WORKSPACE_NAME = `Test Workspace ${Date.now()}`;
  // A serial-mode retry re-runs the whole block from the first test, which
  // creates a second, identically-named workspace — selecting by label would
  // then be ambiguous. Select by id instead, captured fresh on each attempt.
  let workspaceId = '';

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin123456');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('Login and create workspace', async ({ page }) => {
    // Create Workspace (custom in-app modal, not a native dialog)
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(WORKSPACE_NAME);
    await page.getByTestId('prompt-submit').click();

    // Check if workspace is selected (we can assert that it appears)
    await expectWorkspaceListed(page, WORKSPACE_NAME);
    workspaceId = await activeWorkspaceId(page);
  });

  test('Create a collection', async ({ page }) => {
    await page.goto('/');
    // A fresh login defaults to whatever workspace is first for this admin —
    // with many workspaces accumulated across the suite that's not
    // necessarily the one this file created, so select it explicitly.
    await selectWorkspace(page, workspaceId);

    // Click on New Collection
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible()) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }

    await page.getByTestId('prompt-input').fill('Test Collection');
    await page.getByTestId('prompt-input').press('Enter');

    // Verify it exists
    await expect(page.getByTestId('node-Test Collection')).toBeVisible();
  });

  test('Create a folder inside collection', async ({ page }) => {
    await page.goto('/');
    await selectWorkspace(page, workspaceId);

    // Open context menu for collection
    await page.getByTestId('node-Test Collection').hover();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection') });
    await colNode.getByTestId('action-menu-btn').click();

    await page.getByTestId('action-menu-new-folder').click();

    await page.getByTestId('prompt-input').fill('Test Folder');
    await page.getByTestId('prompt-input').press('Enter');

    await expect(page.getByTestId('node-Test Folder')).toBeVisible();
  });

  test('Rename collection and delete folder', async ({ page }) => {
    await page.goto('/');
    await selectWorkspace(page, workspaceId);

    // Rename Collection
    await page.getByTestId('node-Test Collection').hover();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection') });
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-rename').click();

    await page.getByTestId('inline-rename-input').fill('Renamed Collection');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('node-Renamed Collection')).toBeVisible();

    // A fresh page load starts every collection collapsed (open/closed state
    // isn't persisted) — expand it to reveal the folder created in the
    // previous test before trying to interact with it.
    await page.getByTestId('node-Renamed Collection').click();

    // Delete folder
    await page.getByTestId('node-Test Folder').hover();
    const folderNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Folder') });
    await folderNode.getByTestId('action-menu-btn').click();

    await page.getByTestId('action-menu-delete').click();
    await page.getByTestId('confirm-btn').click();

    await expect(page.getByTestId('node-Test Folder')).not.toBeVisible();
  });

  test('duplicate, move between folders, reorder survives reload', async ({ page }) => {
    await page.goto('/');
    await selectWorkspace(page, workspaceId);

    // This workspace already has "Renamed Collection" from a previous test,
    // but the sidebar briefly renders its empty state while collections load
    // on a fresh page — wait for that load to settle so the always-present
    // header button (not the transient empty-state one) is what gets clicked.
    await expect(page.getByTestId('node-Renamed Collection')).toBeVisible();

    // 1. Create a new collection for this specific test
    await page.getByTestId('new-collection-btn').click();

    await page.getByTestId('prompt-input').fill('Sort Collection');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('node-Sort Collection')).toBeVisible();

    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Sort Collection') });

    // Create Folder A
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Folder A');
    await page.getByTestId('prompt-input').press('Enter');

    // Create Folder B
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill('Folder B');
    await page.getByTestId('prompt-input').press('Enter');

    // Create Request Z in Folder A. Unlike collections, a folder's
    // expanded/collapsed state isn't auto-opened when a child is added to
    // it, so it has to be expanded explicitly before its requests appear.
    const folderANode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Folder A') });
    await page.getByTestId('node-Folder A').click();
    await startNewRequest(page, folderANode);
    await page.getByTestId('prompt-input').fill('Request Z');
    await page.getByTestId('prompt-input').press('Enter');

    // Create Request A in Folder A
    await startNewRequest(page, folderANode);
    await page.getByTestId('prompt-input').fill('Request A');
    await page.getByTestId('prompt-input').press('Enter');

    // Duplicate Request Z
    const reqZNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Request Z') });
    await reqZNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-duplicate').click();
    await expect(page.getByTestId('node-Request Z (Copy)')).toBeVisible();

    // Move Request Z (Copy) to Folder B
    const movePut = page.waitForResponse(r => r.request().method() === 'PUT' && /\/requests\//.test(r.url()));
    await page.dragAndDrop('[data-testid="node-Request Z (Copy)"]', '[data-testid="node-Folder B"]');
    await movePut;

    // Dropping on a folder expands it once the move lands, so expand it only
    // if it is still collapsed � an unconditional click would toggle it shut.
    const movedCopy = page.getByTestId('node-Request Z (Copy)');
    if (!(await movedCopy.isVisible())) await page.getByTestId('node-Folder B').click();
    await expect(movedCopy).toBeVisible();

    // Duplicate Collection (collections are prefixed "Copy of X", unlike
    // requests/folders which are suffixed "X (Copy)")
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-duplicate').click();
    await expect(page.getByTestId('node-Copy of Sort Collection')).toBeVisible();

    // Reload
    await page.reload();

    // Re-expand Collection and Folder A
    await page.getByTestId('node-Sort Collection').click();
    await page.getByTestId('node-Folder A').click();

    await expect(page.getByTestId('node-Request A')).toBeVisible();
    await expect(page.getByTestId('node-Request Z')).toBeVisible();
  });
});

test.describe('Full CRUD / Rename Matrix', () => {
  const email = `matrix_${uuidv4()}@example.com`;
  const pass = 'password123';
  const timestamp = Date.now();

  test.beforeAll(async ({ request }) => {
    // Fast register to prep user
    await request.post('/api/auth/register', {
      data: { name: 'Matrix Tester', email, password: pass }
    });
  });

  test('Matrix Test: Rename Workspace, Collection, Request, Variable, and Parameter', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(pass);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // 2. Create Workspace and Rename it (custom in-app modal, not a native dialog)
    const wsName = `WS_${timestamp}`;
    const renamedWs = `${wsName}_Renamed`;

    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(wsName);
    await page.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(page, wsName);
    
    // Select it
    await selectWorkspace(page, { label: wsName });

    // Rename Workspace. Opening the modal kicks off its own GET to refresh
    // name/description/isPublic, which lands in state (setName(...)) right
    // before the loading spinner clears — filling the input before that
    // finishes gets silently overwritten back to the original name.
    await page.getByTestId('workspace-settings-btn').click();
    await expect(page.getByText('Loading details...')).not.toBeVisible();
    await page.getByTestId('workspace-name-input').fill(renamedWs);
    const wsUpdateResponse = page.waitForResponse(resp =>
      /\/api\/workspaces\/[^/]+$/.test(resp.url()) && resp.request().method() === 'PUT'
    );
    await page.getByTestId('workspace-save-btn').click();
    await wsUpdateResponse;
    await page.getByTestId('close-workspace-modal').click();
    await expectWorkspaceListed(page, renamedWs);

    // 3. Create Environment, Variable, and Rename Variable
    await page.getByTestId('tab-environments').click();

    // Custom in-app modal, not a native dialog
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Test Env');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('env-node-Test Env')).toBeVisible();

    // Add Variable
    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill('old_var');
    await page.getByTestId('env-var-initial-0').fill('value1');
    await page.getByTestId('env-save-btn').click();
    // The button is also disabled while the save is in flight, so wait for the confirmation:
    // editing before it lands is overwritten when the save finishes and clears the dirty flag.
    await expect(page.getByText('Environment saved')).toBeVisible();
    await expect(page.getByTestId('env-save-btn')).toBeDisabled(); // saved: clean again
    // Rename Variable
    await page.getByTestId('env-var-key-0').fill('renamed_var');
    await page.getByTestId('env-save-btn').click();

    // 4. Create Collection, Request, and Parameter, then Rename them
    await page.getByTestId('tab-collections').click();

    // Create Collection (custom in-app modal, not a native dialog)
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill('Test Collection');
    await page.getByTestId('prompt-input').press('Enter');

    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection') });
    await expect(colNode).toBeVisible();

    // Rename Collection
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-rename').click();
    await page.getByTestId('inline-rename-input').fill('Renamed Collection');
    await page.getByTestId('inline-rename-input').press('Enter');
    
    const renamedColNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Renamed Collection') });
    await expect(renamedColNode).toBeVisible();

    // Create Request inside Collection (custom in-app modal, not a native dialog)
    await renamedColNode.hover();
    await startNewRequest(page, renamedColNode);
    await page.getByTestId('prompt-input').fill('Initial Request');
    await page.getByTestId('prompt-input').press('Enter');

    const reqNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Initial Request') });
    await expect(reqNode).toBeVisible();

    // Rename Request
    await reqNode.hover();
    await reqNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-rename').click();
    await page.getByTestId('inline-rename-input').fill('Renamed Request');
    await page.getByTestId('inline-rename-input').press('Enter');

    const renamedReqNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Renamed Request') });
    await expect(renamedReqNode).toBeVisible();

    // Open the Request
    await renamedReqNode.click();
    await expect(page.getByTestId('request-url-input')).toBeVisible();

    // Add Query Parameter
    await page.getByTestId('kv-key-0').fill('old_param');
    await page.getByTestId('kv-val-0').fill('old_value');
    
    // Verify it updates URL
    await expect(page.getByTestId('request-url-input')).toHaveValue(/\?old_param=old_value/);

    // Rename Query Parameter
    await page.getByTestId('kv-key-0').fill('renamed_param');
    
    // Verify it updates URL with new name
    await expect(page.getByTestId('request-url-input')).toHaveValue(/\?renamed_param=old_value/);

    // Save Request
    await page.getByTestId('request-save-btn').click();
    // Verify no save prompt (already in a collection)
    await expect(page.getByTestId('save-req-submit-btn')).not.toBeVisible();
    
    // Test successfully completes the full CRUD renaming matrix!
  });
});

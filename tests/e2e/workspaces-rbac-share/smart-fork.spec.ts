import { test, expect, type Page } from '../fixtures';
import { selectWorkspace, expectWorkspaceListed, registerUser } from '../helpers';

test.describe('Smart Fork (collection fork + auto-sync)', () => {
  test('fork from a shared workspace into the personal workspace, switch workspaces, and see an unmodified item update live via socket', async ({ browser }) => {
    const timestamp = Date.now();
    const userName = `Fork User ${timestamp}`;
    const wsAName = `Fork WS A ${timestamp}`;
    // Every user gets this auto-created on signup — it's the only valid fork
    // target (see routes/forks.ts's "shared → personal workspace" rule), so
    // the test never has to create it.
    const personalWsName = `${userName}'s Workspace`;
    const sourceColName = `Fork Source ${timestamp}`;
    const folderName = `Fork Folder ${timestamp}`;
    const forkName = `Forked Col ${timestamp}`;

    const context = await browser.newContext();
    const pageA = await context.newPage();

    // 1. Register (lands on the auto-created personal workspace)
    await registerUser(pageA, 'forkuser', userName);
    await expectWorkspaceListed(pageA, personalWsName);

    // 2. Create a shared workspace A (becomes active) to hold the fork source
    // — forking is not allowed to originate from the personal workspace.
    await pageA.getByTestId('new-workspace-btn').click();
    await pageA.getByTestId('prompt-input').fill(wsAName);
    await pageA.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(pageA, wsAName);

    // 3. Create the source collection + a folder inside it, in workspace A
    await pageA.goto('/');
    const newColBtn = pageA.getByTestId('new-collection-empty-btn');
    if (await newColBtn.isVisible()) {
      await newColBtn.click();
    } else {
      await pageA.getByTestId('new-collection-btn').click();
    }
    await pageA.getByTestId('prompt-input').fill(sourceColName);
    await pageA.getByTestId('prompt-input').press('Enter');
    await expect(pageA.getByTestId(`node-${sourceColName}`).first()).toBeVisible();

    // Reload before interacting further: the tree occasionally renders a
    // transient duplicate node right after an optimistic create (a pre-existing
    // quirk unrelated to forking), which turns the next action-menu click
    // ambiguous. A reload re-fetches the authoritative, de-duplicated tree.
    await pageA.reload();
    const sourceColNode = pageA.locator('[data-testid="node-container"]', { has: pageA.getByTestId(`node-${sourceColName}`) }).first();
    await sourceColNode.getByTestId('action-menu-btn').click();
    await pageA.getByTestId('action-menu-new-folder').click();
    await pageA.getByTestId('prompt-input').fill(folderName);
    await pageA.getByTestId('prompt-input').press('Enter');
    await expect(pageA.getByTestId(`node-${folderName}`).first()).toBeVisible();
    await pageA.reload();

    // 4. Open a second tab (same session) on the personal workspace — the
    // fixed fork target — so it can observe fork events live without ever
    // calling the API directly.
    const pageB = await context.newPage();
    await pageB.goto('/');
    await selectWorkspace(pageB, { label: personalWsName });

    // 5. Fork the source collection from workspace A into the personal workspace
    await sourceColNode.getByTestId('action-menu-btn').click();
    await pageA.getByTestId('action-menu-fork-(auto-sync)').click();

    await pageA.getByTestId('fork-name-input').fill(forkName);
    await expect(pageA.getByTestId('fork-target-workspace')).toContainText(personalWsName);
    await pageA.getByTestId('fork-submit-btn').click();

    // Different active workspace (A) than the fixed target (personal) → toast fires
    await expect(pageA.getByText(/Forked into/)).toBeVisible();

    // 6. pageA itself can also switch over and see it
    await selectWorkspace(pageA, { label: personalWsName });
    await expect(pageA.getByTestId(`node-${forkName}`).first()).toBeVisible();

    // 7. pageB, which never reloaded, sees the forked collection appear live
    // (server emits collection:created to the target workspace's room)
    await expect(pageB.getByTestId(`node-${forkName}`).first()).toBeVisible({ timeout: 15000 });
    await pageB.getByTestId(`node-${forkName}`).first().click();
    await expect(pageB.getByTestId(`node-${folderName}`).first()).toBeVisible();

    // 8. Edit the source (still reachable from pageA, workspace A) — an item the
    // fork owner never touched, so it should sync forward automatically.
    await selectWorkspace(pageA, { label: wsAName });
    const renamedFolderName = `${folderName} Renamed`;
    // Re-expand the source collection (workspace switches collapse the tree)
    await pageA.getByTestId(`node-${sourceColName}`).first().click();
    await expect(pageA.getByTestId(`node-${folderName}`).first()).toBeVisible();
    await pageA.getByTestId(`node-${folderName}`).first().hover();
    const folderNode = pageA.locator('[data-testid="node-container"]', { has: pageA.getByTestId(`node-${folderName}`) }).first();
    await folderNode.getByTestId('action-menu-btn').click();
    await pageA.getByTestId('action-menu-rename').click();
    await pageA.getByTestId('inline-rename-input').fill(renamedFolderName);
    await pageA.keyboard.press('Enter');
    await expect(pageA.getByTestId(`node-${renamedFolderName}`).first()).toBeVisible();

    // 9. pageB (still on the personal workspace, still never reloaded) sees the
    // rename land via the collection:fork-synced socket event — not a manual poll.
    await expect(pageB.getByTestId(`node-${renamedFolderName}`).first()).toBeVisible({ timeout: 15000 });
  });

  test('the fork action is not offered from within the personal workspace itself', async ({ page }) => {
    const timestamp = Date.now();
    const userName = `Fork Guard User ${timestamp}`;
    const colName = `Personal Col ${timestamp}`;

    await registerUser(page, 'forkguard', userName);

    const newColBtn = page.getByTestId('new-collection-empty-btn');
    if (await newColBtn.isVisible()) {
      await newColBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill(colName);
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId(`node-${colName}`).first()).toBeVisible();

    await page.reload();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${colName}`) }).first();
    await colNode.getByTestId('action-menu-btn').click();
    await expect(page.getByTestId('action-menu-fork-(auto-sync)')).not.toBeVisible();
  });

  // ForkModal's copy-variables and copy-environment options; the assertions run after a reload in the target workspace.
  const ts = Date.now();

  async function register(page: Page, name: string, email: string) {
    await page.goto('/register');
    await page.getByTestId('register-name').fill(name);
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 15000 });
  }

  test('forking with copy-variables and copy-environment carries both across', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const email = `forkopts_${ts}@example.com`;
    await register(owner, 'Fork Options', email);

    // A shared (non-personal) workspace — the auto-sync fork is only offered
    // from one of those.
    await owner.getByTestId('new-workspace-btn').click();
    await owner.getByTestId('prompt-input').fill(`Fork Source ${ts}`);
    await owner.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(owner, `Fork Source ${ts}`);

    await owner.getByTestId('new-collection-empty-btn').click();
    await owner.getByTestId('prompt-input').fill('Forkable Collection');
    await owner.getByTestId('prompt-input').press('Enter');
    const col = owner.locator('[data-testid="node-container"]', { has: owner.getByTestId('node-Forkable Collection') });
    await expect(col).toBeVisible();

    // Give the collection a variable, so copy-variables has something to copy.
    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await owner.getByTestId('action-menu-edit-settings').click();
    await owner.getByTestId('group-edit-variables-tab').click();
    await owner.getByTestId('group-add-var-btn').click();
    await owner.getByTestId('group-var-key-0').fill('forkedVar');
    await owner.getByTestId('group-var-val-0').fill('forked-value');
    await owner.getByTestId('group-edit-save-btn').click();

    // And an environment, for copy-environment.
    await owner.getByTestId('tab-environments').click();
    await owner.getByTestId('new-env-btn').click();
    await owner.getByTestId('prompt-input').fill('Fork Env');
    await owner.getByTestId('prompt-input').press('Enter');
    await expect(owner.getByTestId('env-node-Fork Env')).toBeVisible();
    await owner.getByTestId('tab-collections').click();

    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await owner.getByTestId('action-menu-fork-(auto-sync)').click();

    await expect(owner.getByTestId('fork-name-input')).toBeVisible();
    await owner.getByTestId('fork-name-input').fill('Forked With Options');
    // Both options, the two that nothing exercised before.
    await owner.getByTestId('fork-copy-vars-checkbox').check();
    await owner.getByTestId('fork-copy-env-select').selectOption({ label: 'Fork Env' });
    await owner.getByTestId('fork-submit-btn').click();
    await expect(owner.getByTestId('fork-name-input')).toBeHidden();

    // The fork lands in the personal workspace, which signup auto-creates
    // under this exact name (see routes/forks.ts's shared → personal rule).
    // Reload first, so everything below is read back from the server.
    const personal = "Fork Options's Workspace";
    await owner.reload();
    await expectWorkspaceListed(owner, personal);
    await selectWorkspace(owner, { label: personal });

    await expect(owner.getByTestId('node-Forked With Options')).toBeVisible();

    // The copied collection variable came along.
    const forked = owner.locator('[data-testid="node-container"]', { has: owner.getByTestId('node-Forked With Options') });
    await forked.hover();
    await forked.getByTestId('action-menu-btn').click();
    await owner.getByTestId('action-menu-edit-settings').click();
    await owner.getByTestId('group-edit-variables-tab').click();
    await expect(owner.getByTestId('group-var-key-0')).toHaveValue('forkedVar');
    await expect(owner.getByTestId('group-var-val-0')).toHaveValue('forked-value');
    await owner.keyboard.press('Escape');

    // And so did the environment, copied under the server's "(Fork)" suffix.
    await owner.getByTestId('tab-environments').click();
    await expect(owner.getByTestId('env-node-Fork Env (Fork)')).toBeVisible();

    await ownerCtx.close();
  });
});

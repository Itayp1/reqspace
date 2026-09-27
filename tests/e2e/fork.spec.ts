import { test, expect } from '@playwright/test';

test.describe('Smart Fork (collection fork + auto-sync)', () => {
  test('fork from a shared workspace into the personal workspace, switch workspaces, and see an unmodified item update live via socket', async ({ browser }) => {
    const timestamp = Date.now();
    const userName = `Fork User ${timestamp}`;
    const email = `forkuser_${timestamp}@example.com`;
    const pass = 'password123';
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
    await pageA.goto('/register');
    await pageA.getByTestId('register-name').fill(userName);
    await pageA.getByTestId('register-email').fill(email);
    await pageA.getByTestId('register-password').fill(pass);
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*\/$/);
    await expect(pageA.getByTestId('workspace-select')).toContainText(personalWsName);

    // 2. Create a shared workspace A (becomes active) to hold the fork source
    // — forking is not allowed to originate from the personal workspace.
    await pageA.getByTestId('new-workspace-btn').click();
    await pageA.getByTestId('prompt-input').fill(wsAName);
    await pageA.getByTestId('prompt-submit').click();
    await expect(pageA.getByTestId('workspace-select')).toContainText(wsAName);

    // 3. Create the source collection + a folder inside it, in workspace A
    await pageA.goto('/');
    const newColBtn = pageA.getByTestId('new-collection-empty-btn');
    if (await newColBtn.isVisible()) {
      await newColBtn.click();
    } else {
      await pageA.getByTestId('new-collection-btn').click();
    }
    await pageA.getByTestId('prompt-input').fill(sourceColName);
    await pageA.getByTestId('prompt-submit').click();
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
    await pageA.getByTestId('prompt-submit').click();
    await expect(pageA.getByTestId(`node-${folderName}`).first()).toBeVisible();
    await pageA.reload();

    // 4. Open a second tab (same session) on the personal workspace — the
    // fixed fork target — so it can observe fork events live without ever
    // calling the API directly.
    const pageB = await context.newPage();
    await pageB.goto('/');
    await pageB.getByTestId('workspace-select').selectOption({ label: personalWsName });

    // 5. Fork the source collection from workspace A into the personal workspace
    await sourceColNode.getByTestId('action-menu-btn').click();
    await pageA.getByTestId('action-menu-fork-(auto-sync)').click();

    await pageA.getByTestId('fork-name-input').fill(forkName);
    await expect(pageA.getByTestId('fork-target-workspace')).toContainText(personalWsName);
    await pageA.getByTestId('fork-submit-btn').click();

    // Different active workspace (A) than the fixed target (personal) → toast fires
    await expect(pageA.getByText(/Forked into/)).toBeVisible();

    // 6. pageA itself can also switch over and see it
    await pageA.getByTestId('workspace-select').selectOption({ label: personalWsName });
    await expect(pageA.getByTestId(`node-${forkName}`).first()).toBeVisible();

    // 7. pageB, which never reloaded, sees the forked collection appear live
    // (server emits collection:created to the target workspace's room)
    await expect(pageB.getByTestId(`node-${forkName}`).first()).toBeVisible({ timeout: 15000 });
    await pageB.getByTestId(`node-${forkName}`).first().click();
    await expect(pageB.getByTestId(`node-${folderName}`).first()).toBeVisible();

    // 8. Edit the source (still reachable from pageA, workspace A) — an item the
    // fork owner never touched, so it should sync forward automatically.
    await pageA.getByTestId('workspace-select').selectOption({ label: wsAName });
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
    const email = `forkguard_${timestamp}@example.com`;
    const colName = `Personal Col ${timestamp}`;

    await page.goto('/register');
    await page.getByTestId('register-name').fill(userName);
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    const newColBtn = page.getByTestId('new-collection-empty-btn');
    if (await newColBtn.isVisible()) {
      await newColBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill(colName);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId(`node-${colName}`).first()).toBeVisible();

    await page.reload();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${colName}`) }).first();
    await colNode.getByTestId('action-menu-btn').click();
    await expect(page.getByTestId('action-menu-fork-(auto-sync)')).not.toBeVisible();
  });
});

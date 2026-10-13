import { test, expect, type Page } from '@playwright/test';

/**
 * The last three uncovered surfaces:
 *
 *  - `SharedCollectionPage`, the public page a share link opens. `share.spec.ts`
 *    only ever asserted on the JSON the API returns, never on the page.
 *  - `ViewerForkModal`, the "copy this to my own workspace" offer a viewer
 *    gets when they try to save. The Save button is hidden for viewers, so
 *    Ctrl+S is the only way in — which is exactly why it was never tested.
 *  - `ForkModal`'s copy-variables and copy-environment options. `fork.spec.ts`
 *    covers the fork itself but leaves both switches alone.
 *
 * The fork assertions run after a reload in the target workspace, so a copied
 * variable has to have been written server-side, not just mirrored locally.
 */
test.describe('Shared page, viewer fork, fork options', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();

  async function register(page: Page, name: string, email: string) {
    await page.goto('/register');
    await page.getByTestId('register-name').fill(name);
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }

  test('the public share page lists the requests and can run one', async ({ page, context }) => {
    await register(page, 'Share Page Owner', `sharepage_${ts}@example.com`);

    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Public Collection');
    await page.getByTestId('prompt-submit').click();
    const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Public Collection') });
    await expect(col).toBeVisible();

    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Public Request');
    await page.getByTestId('prompt-submit').click();
    await page.getByTestId('node-Public Request').click();
    await page.getByTestId('request-url-input').fill('https://public.example.com/data');
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-share-via-link').click();
    await page.getByTestId('share-link-generate-btn').click();
    const link = await page.getByTestId('share-link-result').inputValue();
    expect(link.length).toBeGreaterThan(0);
    const shortId = new URL(link).pathname.split('/').pop()!;

    // Open the link in a context with no session at all — this is what a
    // recipient actually sees.
    const anon = await context.browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.route('https://public.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"shared":true}' })
    );
    await anonPage.goto(`/share/${shortId}`);

    await expect(anonPage.getByTestId('shared-collection-name')).toHaveText('Public Collection');
    await expect(anonPage.getByTestId('shared-request-name')).toHaveText('Public Request');
    await expect(anonPage.getByTestId('shared-request-url')).toHaveText('https://public.example.com/data');
    await expect(anonPage.getByText(/Shared Collection \(Expires/)).toBeVisible();

    // The Play button runs the request from the recipient's own browser.
    await anonPage.getByTestId('shared-request-run-btn').click();
    // The viewer sees the whole response envelope, body included.
    const result = anonPage.getByTestId('shared-request-result');
    await expect(result).toContainText('"status": 200', { timeout: 15000 });
    await expect(result).toContainText('shared');

    await anon.close();
  });

  test('with two requests, a run only fills in its own row', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(`sharepage_${ts}@example.com`);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();

    const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Public Collection') });
    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Second Public Request');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Second Public Request')).toBeVisible();
    await page.getByTestId('node-Second Public Request').click();
    await page.getByTestId('request-url-input').fill('https://public.example.com/second');
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-share-via-link').click();
    await page.getByTestId('share-link-generate-btn').click();
    const shortId = new URL(await page.getByTestId('share-link-result').inputValue()).pathname.split('/').pop()!;

    const anon = await context.browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.route('https://public.example.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ which: new URL(route.request().url()).pathname }),
      })
    );
    await anonPage.goto(`/share/${shortId}`);
    await expect(anonPage.getByTestId('shared-request-row')).toHaveCount(2);

    // Run only the second row. The share payload carries no ids, so every row
    // used to share one undefined key: the result landed under both rows and
    // both buttons disabled together.
    await anonPage.getByTestId('shared-request-run-btn').nth(1).click();
    await expect(anonPage.getByTestId('shared-request-result')).toHaveCount(1);
    await expect(anonPage.getByTestId('shared-request-result')).toContainText('/second');
    await expect(anonPage.getByTestId('shared-request-row').nth(0)
      .getByTestId('shared-request-result')).toHaveCount(0);

    await anon.close();
  });

  test('a revoked link shows an error page, not a blank one', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(`sharepage_${ts}@example.com`);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();

    const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Public Collection') });
    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-share-via-link').click();
    await page.getByTestId('share-link-generate-btn').click();
    const link = await page.getByTestId('share-link-result').inputValue();
    const shortId = new URL(link).pathname.split('/').pop()!;

    const revoke = page.waitForResponse(
      (r) => r.url().includes(`/share/${shortId}`) && r.request().method() === 'DELETE'
    );
    await page.getByTestId('share-link-revoke-btn').click();
    expect((await revoke).status()).toBe(200);

    const anon = await context.browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/share/${shortId}`);
    // An explicit message, not an endless "Loading shared collection..." and
    // not a bounce to /login.
    await expect(anonPage.getByTestId('shared-collection-error')).toContainText(/not found|expired/i, { timeout: 15000 });
    expect(new URL(anonPage.url()).pathname).toBe(`/share/${shortId}`);
    await anon.close();
  });

  test('a viewer pressing Ctrl+S is offered a copy into their own workspace', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await register(owner, 'Fork Owner', `forkowner_${ts}@example.com`);
    const workspaceId = await owner.getByTestId('workspace-select').inputValue();

    await owner.getByTestId('new-collection-empty-btn').click();
    await owner.getByTestId('prompt-input').fill('Viewer Collection');
    await owner.getByTestId('prompt-submit').click();
    const col = owner.locator('[data-testid="node-container"]', { has: owner.getByTestId('node-Viewer Collection') });
    await expect(col).toBeVisible();
    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await owner.getByTestId('action-menu-new-request').click();
    await owner.getByTestId('prompt-input').fill('Viewer Request');
    await owner.getByTestId('prompt-submit').click();
    await expect(owner.getByTestId('node-Viewer Request')).toBeVisible();

    const viewerEmail = `forkviewer_${ts}@example.com`;
    const viewerCtx = await browser.newContext();
    const viewer = await viewerCtx.newPage();
    await register(viewer, 'Fork Viewer', viewerEmail);

    await owner.getByTestId('workspace-settings-btn').click();
    await owner.getByTestId('workspace-members-tab').click();
    await owner.getByTestId('user-autocomplete-input').fill(viewerEmail);
    await owner.getByTestId('user-autocomplete-result').first().click();
    await owner.getByTestId('workspace-invite-role').selectOption('viewer');
    await owner.getByTestId('workspace-invite-btn').click();
    await expect(owner.getByTestId('member-email').filter({ hasText: viewerEmail })).toBeVisible();
    await owner.getByTestId('close-workspace-modal').click();

    await viewer.reload();
    await viewer.getByTestId('workspace-select').selectOption(workspaceId);
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
    await expect(owner.getByTestId('workspace-select')).toContainText(`Fork Source ${ts}`);

    await owner.getByTestId('new-collection-empty-btn').click();
    await owner.getByTestId('prompt-input').fill('Forkable Collection');
    await owner.getByTestId('prompt-submit').click();
    const col = owner.locator('[data-testid="node-container"]', { has: owner.getByTestId('node-Forkable Collection') });
    await expect(col).toBeVisible();

    // Give the collection a variable, so copy-variables has something to copy.
    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await owner.getByTestId('action-menu-edit').click();
    await owner.getByTestId('group-edit-variables-tab').click();
    await owner.getByTestId('group-add-var-btn').click();
    await owner.getByTestId('group-var-key-0').fill('forkedVar');
    await owner.getByTestId('group-var-val-0').fill('forked-value');
    await owner.getByTestId('group-edit-save-btn').click();

    // And an environment, for copy-environment.
    await owner.getByTestId('tab-environments').click();
    await owner.getByTestId('new-env-btn').click();
    await owner.getByTestId('prompt-input').fill('Fork Env');
    await owner.getByTestId('prompt-submit').click();
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
    await expect(owner.getByTestId('workspace-select')).toContainText(personal);
    await owner.getByTestId('workspace-select').selectOption({ label: personal });

    await expect(owner.getByTestId('node-Forked With Options')).toBeVisible();

    // The copied collection variable came along.
    const forked = owner.locator('[data-testid="node-container"]', { has: owner.getByTestId('node-Forked With Options') });
    await forked.hover();
    await forked.getByTestId('action-menu-btn').click();
    await owner.getByTestId('action-menu-edit').click();
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

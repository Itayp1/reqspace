import { test, expect, type Page } from './fixtures';

/**
 * Request comments had no coverage, and Delete never worked: the server
 * stores each comment under `id`, the editor read `comment._id`, so the
 * request went to `/comments/undefined` and 404'd silently. Other people's
 * comments were also all rendered as the literal word "User".
 *
 * Everything here is re-checked after `page.reload()`, so a comment has to
 * have reached the server rather than just the local tab state.
 *
 * `@` mentions (FEAT-5.2) are not shipped and are not covered.
 */
test.describe('Request comments', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const OWNER = `commentowner_${ts}@example.com`;
  const COLLECTION = `Comment Collection ${ts}`;

  async function openTheRequest(page: Page) {
    await expect(page.getByTestId(`node-${COLLECTION}`)).toBeVisible();
    await page.getByTestId(`node-${COLLECTION}`).click();
    await page.getByTestId('node-Commented Request').click();
    await page.getByTestId('req-tab-comments').click();
  }

  test('a comment survives a reload and shows its author', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Comment Owner');
    await page.getByTestId('register-email').fill(OWNER);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill(COLLECTION);
    await page.getByTestId('prompt-submit').click();
    const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${COLLECTION}`) });
    await expect(col).toBeVisible();
    await col.hover();
    await col.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Commented Request');
    await page.getByTestId('prompt-submit').click();
    await page.getByTestId('node-Commented Request').click();

    await page.getByTestId('req-tab-comments').click();
    await expect(page.getByText('No comments yet. Start the conversation!')).toBeVisible();

    await page.getByTestId('comment-input').fill('First observation');
    await page.getByTestId('comment-submit-btn').click();
    await expect(page.getByTestId('comment-item')).toHaveCount(1);
    await expect(page.getByTestId('comment-text')).toHaveText('First observation');

    // The important half: it came back from the server, not from this tab.
    await page.reload();
    await openTheRequest(page);
    await expect(page.getByTestId('comment-item')).toHaveCount(1);
    await expect(page.getByTestId('comment-text')).toHaveText('First observation');
    await expect(page.getByTestId('comment-author')).toHaveText('You');
  });

  test('a second comment is appended and both persist', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(OWNER);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await openTheRequest(page);

    await page.getByTestId('comment-input').fill('Second observation');
    await page.getByTestId('comment-submit-btn').click();
    await expect(page.getByTestId('comment-item')).toHaveCount(2);
    // The composer clears on success.
    await expect(page.getByTestId('comment-input')).toHaveValue('');

    await page.reload();
    await openTheRequest(page);
    const texts = page.getByTestId('comment-text');
    await expect(texts).toHaveCount(2);
    await expect(texts.nth(0)).toHaveText('First observation');
    await expect(texts.nth(1)).toHaveText('Second observation');
  });

  test('deleting a comment really removes it server-side', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(OWNER);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await openTheRequest(page);
    await expect(page.getByTestId('comment-item')).toHaveCount(2);

    // Watch the DELETE: it used to go to /comments/undefined and 404.
    const deletePromise = page.waitForResponse(
      (r) => /\/comments\/[^/]+$/.test(r.url()) && r.request().method() === 'DELETE'
    );
    const first = page.getByTestId('comment-item').first();
    await first.hover();
    await first.getByTestId('comment-delete-btn').click();
    const deleteRes = await deletePromise;
    expect(deleteRes.status()).toBe(200);
    expect(deleteRes.url()).not.toContain('undefined');

    await expect(page.getByTestId('comment-item')).toHaveCount(1);

    await page.reload();
    await openTheRequest(page);
    await expect(page.getByTestId('comment-item')).toHaveCount(1);
    await expect(page.getByTestId('comment-text')).toHaveText('Second observation');
  });

  test('a teammate sees the real author name, and cannot delete it', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await owner.goto('/login');
    await owner.getByTestId('login-email').fill(OWNER);
    await owner.getByTestId('login-password').fill('password123');
    await owner.getByTestId('login-submit').click();
    await expect(owner.getByTestId('workspace-select')).toBeVisible();
    const workspaceId = await owner.getByTestId('workspace-select').inputValue();

    // A second user, invited as an editor so they can open the request.
    const mateEmail = `commentmate_${ts}@example.com`;
    const mateCtx = await browser.newContext();
    const mate = await mateCtx.newPage();
    await mate.goto('/register');
    await mate.getByTestId('register-name').fill('Comment Mate');
    await mate.getByTestId('register-email').fill(mateEmail);
    await mate.getByTestId('register-password').fill('password123');
    await mate.getByTestId('register-submit').click();
    await expect(mate.getByTestId('workspace-select')).toBeVisible();

    await owner.getByTestId('workspace-settings-btn').click();
    await owner.getByTestId('workspace-members-tab').click();
    await owner.getByTestId('user-autocomplete-input').fill(mateEmail);
    await owner.getByTestId('user-autocomplete-result').first().click();
    await owner.getByTestId('workspace-invite-role').selectOption('editor');
    await owner.getByTestId('workspace-invite-btn').click();
    await expect(owner.getByTestId('member-email').filter({ hasText: mateEmail })).toBeVisible();
    await owner.getByTestId('close-workspace-modal').click();

    // The teammate reloads into the shared workspace and reads the comment.
    await mate.reload();
    await mate.getByTestId('workspace-select').selectOption(workspaceId);
    await expect(mate.getByTestId(`node-${COLLECTION}`)).toBeVisible();
    await mate.getByTestId(`node-${COLLECTION}`).click();
    await mate.getByTestId('node-Commented Request').click();
    await mate.getByTestId('req-tab-comments').click();

    // The owner's name, not the literal word "User".
    await expect(mate.getByTestId('comment-author')).toHaveText('Comment Owner');
    // Someone else's comment offers no delete button.
    await mate.getByTestId('comment-item').first().hover();
    await expect(mate.getByTestId('comment-delete-btn')).toHaveCount(0);

    // And the teammate's own comment shows as "You" to them, under their name
    // to the owner.
    await mate.getByTestId('comment-input').fill('Mate here');
    await mate.getByTestId('comment-submit-btn').click();
    await expect(mate.getByTestId('comment-item')).toHaveCount(2);

    await owner.reload();
    await expect(owner.getByTestId(`node-${COLLECTION}`)).toBeVisible();
    await owner.getByTestId(`node-${COLLECTION}`).click();
    await owner.getByTestId('node-Commented Request').click();
    await owner.getByTestId('req-tab-comments').click();
    await expect(owner.getByTestId('comment-author').nth(1)).toHaveText('Comment Mate');

    await ownerCtx.close();
    await mateCtx.close();
  });

  // Posting a comment used to bump the request's updatedAt on the server and
  // mark the tab dirty, so the author's very next Save raised "A newer version
  // of this request exists on the server" — a conflict with their own comment.
  test('posting a comment leaves the tab clean, and the next save raises no conflict', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(OWNER);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await openTheRequest(page);

    await page.getByTestId('comment-input').fill('No conflict please');
    await page.getByTestId('comment-submit-btn').click();
    await expect(page.getByTestId('comment-text').filter({ hasText: 'No conflict please' })).toBeVisible();
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);

    await page.getByTestId('request-url-input').fill('https://after-comment.example.test');
    const put = page.waitForResponse(r => /\/api\/requests\/[^/]+$/.test(r.url()) && r.request().method() === 'PUT');
    await page.getByTestId('request-save-btn').click();
    expect((await put).status()).toBe(200);
    await expect(page.getByText('Conflict Detected')).toHaveCount(0);
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  });
});

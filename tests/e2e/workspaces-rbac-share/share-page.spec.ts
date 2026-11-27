import { test, expect, type Page } from '../fixtures';
import { startNewRequest } from '../helpers';

/**
 * `SharedCollectionPage`, the public page a share link opens. `share.spec.ts`
 * only ever asserted on the JSON the API returns, never on the page.
 * Tests run in order: the later ones log in as the owner created by the first.
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
    await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 15000 });
  }

  test('the public share page lists the requests and can run one', async ({ page, context }) => {
    await register(page, 'Share Page Owner', `sharepage_${ts}@example.com`);

    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Public Collection');
    await page.getByTestId('prompt-input').press('Enter');
    const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Public Collection') });
    await expect(col).toBeVisible();

    await col.hover();
    await startNewRequest(page, col);
    await page.getByTestId('prompt-input').fill('Public Request');
    await page.getByTestId('prompt-input').press('Enter');
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
    await startNewRequest(page, col);
    await page.getByTestId('prompt-input').fill('Second Public Request');
    await page.getByTestId('prompt-input').press('Enter');
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
});

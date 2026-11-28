import { test, expect, API_URL, request as pwRequest, type APIRequestContext } from '../fixtures';
import { registerUser, createCollectionUi, openNodeMenu, startNewRequest } from '../helpers';

test.describe('Share Links', () => {
  test('should generate a link, strip sensitive data for anonymous view, and handle revocation', async ({ page, context, request }) => {
    const ts = Date.now();
    await registerUser(page, 'share', 'Test User');

    // Create a new collection
    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Test Collection Share ' + ts);
    await page.getByTestId('prompt-input').press('Enter');
    
    // Create a request with sensitive data
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Share ' + ts) });
    await expect(colNode).toBeVisible();
    await colNode.hover();
    await startNewRequest(page, colNode);
    await page.getByTestId('prompt-input').fill('Share Request');
    await page.getByTestId('prompt-input').press('Enter');

    // Creating the request expands the collection. Do not click the collection
    // row — that toggles it shut before the new request is in the tree.
    await expect(page.getByTestId('prompt-input')).toBeHidden();
    const requestNode = page.getByTestId('node-Share Request');
    await expect(requestNode).toBeVisible();
    await requestNode.click();

    await page.getByTestId('request-url-input').fill('https://example.com');

    // Add Auth (Bearer token)
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('super-secret-token-123');
    
    // Add Test Script
    await page.getByTestId('req-tab-tests').click();
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'pm.test("leak", function() { pm.expect(1).to.eql(1); });');
    await page.keyboard.press('Control+V');
    
    await expect(page.locator('.view-lines')).toContainText('leak');

    await page.getByTestId('request-save-btn').click();

    // Open context menu for the collection
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-share-via-link').click();

    // Verify modal is open
    const modal = page.getByTestId('share-link-modal');
    await expect(modal).toBeVisible();

    // Click Generate Link
    const generateBtn = page.getByTestId('share-link-generate-btn');
    await generateBtn.click();

    // Verify result is generated
    const resultInput = page.getByTestId('share-link-result');
    await expect(resultInput).toBeVisible();
    const linkVal = await resultInput.inputValue();
    expect(linkVal.length).toBeGreaterThan(0);
    
    const urlObj = new URL(linkVal);
    const shortId = urlObj.pathname.split('/').pop();
    
    const anonymousContext = await context.browser()!.newContext();
    const anonymousRequest = anonymousContext.request;
    
    const shareResponse = await anonymousRequest.get(`/api/share/${shortId}`);
    expect(shareResponse.status()).toBe(200);
    const shareData = await shareResponse.json();
    
    // Verify collection data is returned
    expect(shareData.collection.name).toBe('Test Collection Share ' + ts);
    
    // Verify sensitive data is stripped
    const reqData = shareData.requests[0];
    expect(reqData.name).toBe('Share Request');
    expect(reqData.auth?.type).toBe('bearer'); // Type is kept
    expect(reqData.auth?.bearer?.length).toBeFalsy(); // Token should be stripped
    expect(reqData.auth?.token).toBeUndefined();
    expect(reqData.testScript).toBeUndefined(); // Scripts should be stripped
    expect(reqData.preRequestScript).toBeUndefined();

    // Revoke the link. The click fires DELETE /share/:shortId without the
    // test being able to see it finish, so wait on the response — asserting
    // the 404 straight after the click raced the delete and got a 200.
    const revokePromise = page.waitForResponse(
      (res) => res.url().includes(`/share/${shortId}`) && res.request().method() === 'DELETE'
    );
    await page.getByTestId('share-link-revoke-btn').click();
    expect((await revokePromise).status()).toBe(200);

    // Assert revocation returns 404
    const revokedResponse = await anonymousRequest.get(`/api/share/${shortId}`);
    expect(revokedResponse.status()).toBe(404);
  });
});

/** UX (QA-56): the share dialog says what a link exposes, before generating it. */
test('Share dialog states what is and is not shared', async ({ page }) => {
  await registerUser(page, 'uxshare');
  await createCollectionUi(page, 'ShareCol');
  await openNodeMenu(page, 'ShareCol');
  await page.getByText('Share via Link').click();
  const note = page.getByTestId('share-link-exposure');
  await expect(note).toContainText('Shared:');
  await expect(note).toContainText('Not shared:');
  await expect(note).toContainText('environment values');
});

test.describe('Share link M1.4', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  /**
   * M1.4 / finding 159. MANUAL_TEST_PLAN.md records a product DECISION: there is intentionally no
   * server-side proxy (shareProxyRouter) for the share page; requests run in the viewer's browser/extension.
   * So there is no product bug to fix and no SSRF surface to test. The closest meaningful test pins that
   * decision: the share link grants no server-side execution (no anonymous proxy that could reach
   * internal addresses) and the public payload is purely descriptive data.
   * This test passes both before and after (no code change was needed).
   */
  let seq = 0;
  const ip = () => `10.${200 + (seq++ % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const idOf = (o: any) => (o.id ?? o._id) as string;
  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }

  test('[M1.4] share link exposes no server-side request execution (no proxy, so no SSRF surface)', async ({ baseURL }) => {
    const owner = await anon();
    const email = `m14_${Date.now()}_${Math.floor(Math.random() * 1e5)}@example.com`;
    expect((await owner.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } })).status()).toBe(201);
    const wsList = await (await owner.get('/api/workspaces')).json();
    const wsId = idOf(wsList.find((w: any) => w.isPersonal) ?? wsList[0]);
    const col = await (await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'M14 col' } })).json();
    const rq = await owner.post(`/api/collections/${idOf(col)}/requests`, { data: { method: 'GET', name: 'internal', url: 'http://127.0.0.1:1/admin' } });
    expect(rq.ok()).toBeTruthy();
    const link = await (await owner.post(`/api/share/collection/${idOf(col)}`, { data: {} })).json();

    const viewer = await anon();
    const view = await viewer.get(`/api/share/${link.shortId}`);
    expect(view.status()).toBe(200);
    const body = await view.json();
    // Descriptive data only: nothing that tells the page to execute through the server.
    expect(JSON.stringify(body)).not.toMatch(/proxy|execute/i);

    // No anonymous (or owner) server-side execution endpoint hangs off the share link.
    for (const path of ['proxy', 'execute', 'run', 'send']) {
      for (const ctx of [viewer, owner]) {
        const res = await ctx.post(`/api/share/${link.shortId}/${path}`, {
          data: { method: 'GET', url: 'http://127.0.0.1:1/admin' },
          headers: { origin: new URL(baseURL!).origin },
        });
        expect([401, 403, 404], `${path} -> ${res.status()}`).toContain(res.status());
        expect(res.status()).not.toBeLessThan(400);
      }
    }
  });
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

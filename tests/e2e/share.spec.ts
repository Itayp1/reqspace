import { test, expect } from '@playwright/test';

test.describe('Share Links', () => {
  test('should generate a link, strip sensitive data for anonymous view, and handle revocation', async ({ page, context, request }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Test User');
    await page.getByTestId('register-email').fill('share' + ts + '@example.com');
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('workspace-select')).toBeVisible();

    // Create a new collection
    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Test Collection Share ' + ts);
    await page.getByTestId('prompt-submit').click();
    
    // Create a request with sensitive data
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Share ' + ts) });
    await expect(colNode).toBeVisible();
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Share Request');
    await page.getByTestId('prompt-submit').click();

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
    await page.getByTestId('monaco-editor-container').click();
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

    // Revoke the link
    await page.getByTestId('share-link-revoke-btn').click();
    
    // Assert revocation returns 404
    const revokedResponse = await anonymousRequest.get(`/api/share/${shortId}`);
    expect(revokedResponse.status()).toBe(404);
  });
});

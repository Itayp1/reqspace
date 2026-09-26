import { test, expect } from '@playwright/test';

test.describe('Share Links', () => {
  test('should generate a link, strip sensitive data for anonymous view, and handle revocation', async ({ page, context, request }) => {
    // Register unique user
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'share' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');

    await page.waitForSelector('[data-testid="workspace-select"]');

    // Create a new collection
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill('Test Collection Share ' + ts);
    await page.getByTestId('prompt-submit').click();

    // Create a request with sensitive data
    await page.getByTestId('action-menu-btn').first().click();
    await page.getByTestId('action-menu-add-request').click();
    await page.getByTestId('request-name-input').fill('Share Request');
    await page.getByTestId('request-url-input').fill('https://example.com');
    await page.getByTestId('save-request-btn').click();

    // Add Auth (Bearer token)
    await page.getByTestId('auth-tab-btn').click();
    await page.locator('select.w-full.p-2.border').selectOption('bearer');
    await page.getByTestId('bearer-token-input').fill('super-secret-token-123');
    
    // Add Test Script
    await page.getByTestId('tests-tab-btn').click();
    const monacoEditor = page.locator('.monaco-editor').nth(1); // Test script is usually second editor
    if (await monacoEditor.isVisible()) {
      await monacoEditor.click();
      await page.keyboard.type('pm.test("leak", function() { pm.expect(1).to.eql(1); });');
    }
    await page.getByTestId('save-request-btn').click();

    // Open context menu for first collection
    const actionMenuBtn = page.getByTestId('action-menu-btn').first();
    await actionMenuBtn.waitFor({ state: 'visible' });
    await actionMenuBtn.click();

    // Click "Share via Link"
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
    
    // Fetch it anonymously via request
    // The link is usually http://localhost:5173/share/:shortId
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

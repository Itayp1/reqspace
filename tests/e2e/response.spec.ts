import { test, expect } from '@playwright/test';

test.describe('Response & Code Gen', () => {
  const timestamp = Date.now();
  const testEmail = `response_${timestamp}@example.com`;

  test('Test Results and Code Generation Modal', async ({ page }) => {
    // Register
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Response User');
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', 'password');
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/.*\/$/);

    // Go to "Tests" tab in request editor
    await page.click('button:has-text("Tests")');
    
    // Write a script pm.test(...)
    // The Monaco editor is tricky to type into directly, usually we use evaluate or click and type
    await page.click('[data-testid="monaco-editor-container"]');
    await page.keyboard.type('pm.test("Status 200", () => { pm.expect(pm.response.code).to.equal(200); });');

    // Send request
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('200 OK');

    // Check Test Results tab
    await page.click('[data-testid="response-tab-test_results"]');
    const testResultItem = page.locator('[data-testid="test-result-item"]');
    await expect(testResultItem).toBeVisible();
    await expect(testResultItem.locator('[data-testid="test-result-status"]')).toHaveText('PASS');
    await expect(testResultItem.locator('[data-testid="test-result-name"]')).toHaveText('Status 200');

    // Click Code Generation
    await page.click('[data-testid="codegen-btn"]');
    
    // Verify Modal
    const codeGenModal = page.locator('[data-testid="codegen-modal"]');
    await expect(codeGenModal).toBeVisible();

    // Check Curl
    await page.click('[data-testid="codegen-lang-curl"]');
    await expect(page.locator('[data-testid="codegen-code-block"]')).toContainText('curl -X GET \'https://httpbin.org/get\'');

    // Check Python
    await page.click('[data-testid="codegen-lang-python-requests"]');
    await expect(page.locator('[data-testid="codegen-code-block"]')).toContainText('import requests');
  });

  test('per-mode viewer, image/PDF, timeout and error paths', async ({ page }) => {
    // Register
    const timestamp = Date.now();
    const testEmail = `viewer_${timestamp}@example.com`;
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Viewer User');
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', 'password');
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/.*\/$/);

    // Mock proxy responses
    await page.route('**/proxy', async route => {
      const postData = JSON.parse(route.request().postData() || '{}');
      
      if (postData.url === 'https://mock.com/json') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: { message: 'hello JSON' },
            time: 50,
            size: 100
          })
        });
      }
      
      if (postData.url === 'https://mock.com/html') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'text/html' },
            body: '<h1>Hello HTML</h1>',
            time: 50,
            size: 100
          })
        });
      }
      
      if (postData.url === 'https://mock.com/image') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'image/png' },
            body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            isBase64: true,
            time: 50,
            size: 100
          })
        });
      }
      
      if (postData.url === 'https://mock.com/pdf') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/pdf' },
            body: 'JVBERi0xLg==',
            isBase64: true,
            time: 50,
            size: 100
          })
        });
      }
      
      if (postData.url === 'https://mock.com/timeout') {
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Gateway Timeout'
          })
        });
      }
      
      return route.continue();
    });

    // 1. JSON (pretty and raw)
    await page.getByTestId('request-url-input').fill('https://mock.com/json');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('200 OK');
    await expect(page.locator('.monaco-editor').first()).toBeVisible();
    await page.click('button:has-text("raw")');
    await expect(page.locator('.monaco-editor').first()).toBeVisible();

    // 2. HTML (preview)
    await page.getByTestId('request-url-input').fill('https://mock.com/html');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('200 OK');
    await page.click('button:has-text("preview")');
    await expect(page.locator('iframe[title="Response HTML Preview"]')).toBeVisible();

    // 3. Image
    await page.getByTestId('request-url-input').fill('https://mock.com/image');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.locator('img[alt="Response"]')).toBeVisible();

    // 4. PDF
    await page.getByTestId('request-url-input').fill('https://mock.com/pdf');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.locator('object[type="application/pdf"]')).toBeVisible();

    // 5. Timeout/Error
    await page.getByTestId('request-url-input').fill('https://mock.com/timeout');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('504');
    await page.click('button:has-text("pretty")');
    await expect(page.locator('.monaco-editor').first()).toBeVisible();
  });
});

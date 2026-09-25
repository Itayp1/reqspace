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
});

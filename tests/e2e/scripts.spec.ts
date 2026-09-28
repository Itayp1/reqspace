import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Script Execution', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Register and Login (runs for each test)
    const timestamp = Date.now();
    const testEmail = `scripts_${timestamp}_${Math.random().toString(36).substring(7)}@example.com`;
    
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Script User');
    await page.getByTestId('register-email').fill(testEmail);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    
    // Setup route mock for all tests
    await page.route('https://httpbin.org/**', route => {
      if (route.request().url().includes('/status/201')) {
        return route.fulfill({ status: 201, statusText: 'Created', contentType: 'application/json', body: '{}' });
      }
      return route.fulfill({
        status: 200,
        statusText: 'OK',
        contentType: 'application/json',
        body: JSON.stringify({ url: route.request().url() }),
      });
    });
  });

  test('Pre-request script sets environment variable', async ({ page }) => {
    // 2. Create and select Environment
    await page.getByTestId('tab-environments').click();
    
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Test Env');
    await page.getByTestId('prompt-submit').click();
    
    // Wait for the environment to be created and appear in sidebar
    await expect(page.getByTestId('env-node-Test Env')).toBeVisible();
    
    // Select the environment in the top bar dropdown
    await expect(page.getByTestId('env-select')).toContainText('Test Env');
    await page.getByTestId('env-select').selectOption({ label: 'Test Env' });

    // 3. Create a request
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // 4. Write Pre-request Script
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'pm.environment.set("myvar", "123");');
    await page.keyboard.press('Control+V');

    // 5. Send Request
    await page.getByTestId('request-send-btn').click();
    
    // Wait for response to be 200 OK
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // 6. Verify environment variable
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-node-Test Env').click();
    
    // Wait for the tab to open
    const envTab = page.locator('[data-testid^="tab-"]:not([role="tab"])', { hasText: 'Test Env' });
    await expect(envTab).toBeVisible();
    
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('myvar');
    await expect(page.getByTestId('env-var-current-0')).toHaveValue('123');
  });

  test('Failing assertions display correctly', async ({ page }) => {
    // 1. Create a request
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // 2. Write Test Script with failing assertion
    await page.getByTestId('req-tab-tests').click();
    await page.getByTestId('monaco-editor-container').click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'pm.test("Should fail", function() { pm.expect(1).to.eql(2); });\npm.test("Should pass", function() { pm.expect(1).to.eql(1); });');
    await page.keyboard.press('Control+V');

    // 3. Send Request
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // 4. Verify test results tab
    await page.getByTestId('response-tab-test_results').click();
    
    const results = page.getByTestId('test-result-item');
    await expect(results).toHaveCount(2);

    const failResult = results.nth(0);
    await expect(failResult.getByTestId('test-result-name')).toContainText('Should fail');
    await expect(failResult.getByTestId('test-result-status')).toContainText('FAIL');
    await expect(failResult).toContainText('expected 1 to deeply equal 2'); // The error message

    const passResult = results.nth(1);
    await expect(passResult.getByTestId('test-result-name')).toContainText('Should pass');
    await expect(passResult.getByTestId('test-result-status')).toContainText('PASS');
  });

  test('pm.sendRequest behavior', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Pre-request script to send a request
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), `pm.sendRequest('https://httpbin.org/status/201', function (err, res) { pm.globals.set("sr_code", res.code); });`);
    await page.keyboard.press('Control+V');

    // We need to wait for sendRequest to finish before the main request is sent.
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // Verify environment variable set by sendRequest
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-globals-btn').click();
    
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('sr_code');
    await expect(page.getByTestId('env-var-current-0')).toHaveValue('201');
  });

  test('Script isolation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Pre-request script defining a variable
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'var my_isolated_var = "hello";');
    await page.keyboard.press('Control+V');

    // Test script trying to access it
    await page.getByTestId('req-tab-tests').click();
    await page.getByTestId('monaco-editor-container').click();
    
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), 'pm.test("Isolated var is undefined", function() { pm.expect(typeof my_isolated_var).to.eql("undefined"); });');
    await page.keyboard.press('Control+V');

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // Verify test passed
    await page.getByTestId('response-tab-test_results').click();
    const result = page.getByTestId('test-result-item').nth(0);
    await expect(result.getByTestId('test-result-status')).toContainText('PASS');
  });
});

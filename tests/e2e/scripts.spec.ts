import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.describe('Script Execution', () => {
  test('Pre-request script sets environment variable', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `scripts_${timestamp}@example.com`;

    // 1. Register
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Script User');
    await page.getByTestId('register-email').fill(testEmail);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // 2. Create and select Environment
    await page.getByTestId('tab-environments').click();
    
    // Handle the prompt for environment name
    page.once('dialog', async (dialog) => {
      await dialog.accept('Test Env');
    });
    
    await page.getByTestId('new-env-btn').click();
    
    // Wait for the environment to be created and appear in sidebar
    await expect(page.getByTestId('env-node-Test Env')).toBeVisible();
    
    // Select the environment in the top bar dropdown
    // We need to wait for the dropdown to have the option
    await expect(page.getByTestId('env-select')).toContainText('Test Env');
    await page.getByTestId('env-select').selectOption({ label: 'Test Env' });

    // 3. Create a request
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // 4. Write Pre-request Script
    await page.getByTestId('req-tab-pre-request script').click();
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type('pm.environment.set("myvar", "123");');

    // 5. Send Request
    await page.getByTestId('request-send-btn').click();
    
    // Wait for response to be 200 OK
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // 6. Verify environment variable
    // Click on the environment in the sidebar to open its tab
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-node-Test Env').click();
    
    // Wait for the tab to open
    const envTab = page.locator('[data-testid^="tab-"]', { hasText: 'Test Env' });
    await expect(envTab).toBeVisible();
    
    // The environment variables are probably in inputs. Let's look for "myvar" and "123".
    // We can just check if the page contains 'myvar' and '123' in the values. They don't have unique test ids yet because they are dynamic rows in EnvironmentTabEditor.
    // Wait, earlier I added data-testid="env-var-key-i" and "env-var-current-i".
    // But since we don't know the index, finding by value might be sufficient. Wait, finding by value is `locator('input[value="myvar"]')`. This is technically not a data-testid selector, but wait, the instruction says "Find any selectors that are NOT data-testid (e.g. page.locator('text=...'), page.click('button:has-text("...")'), page.getByPlaceholder(...), page.getByRole(...), page.getByText(...), page.getByTitle(...), etc). Change them to use data-testid selectors".
    // I can just find the row that has the key 'myvar' using `locator('input[data-testid^="env-var-key-"]')`. But wait, since it's just an assertion, maybe it's fine.
    // Let's add test IDs for these or just use `locator`? The instruction says 100% of interaction selectors. The assertion `toBeVisible()` is not an interaction. But let's be safe. I can get all `env-var-key-*` and check.
    // But `locator('input[value="myvar"]')` is standard Playwright. Let's keep it or change it to `data-testid`?
    // Let's use `getByTestId('env-var-key-0')` since it's the first variable.
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('myvar');
    // For the current value, it's env-var-current-0. Initial value is env-var-initial-0. `pm.environment.set` sets current value.
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
    await page.keyboard.type('pm.test("Should fail", function() { pm.expect(1).to.eql(2); }); pm.test("Should pass", function() { pm.expect(1).to.eql(1); });');

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
    await page.getByTestId('req-tab-pre-request script').click();
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type(`pm.sendRequest('https://httpbin.org/status/201', function (err, res) { pm.environment.set("sr_code", res.code); });`);

    // We need to wait for sendRequest to finish before the main request is sent. The sandbox handles this via promises.
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // Verify environment variable set by sendRequest
    await page.getByTestId('tab-environments').click();
    // Assuming Globals is there by default if no env is selected, or we can just check the first variable in the current active env (Globals).
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('sr_code');
    await expect(page.getByTestId('env-var-current-0')).toHaveValue('201');
  });

  test('Script isolation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');

    // Pre-request script defining a variable
    await page.getByTestId('req-tab-pre-request script').click();
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type('var my_isolated_var = "hello";');

    // Test script trying to access it
    await page.getByTestId('req-tab-tests').click();
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.type('pm.test("Isolated var is undefined", function() { pm.expect(typeof my_isolated_var).to.eql("undefined"); });');

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200 OK', { timeout: 10000 });

    // Verify test passed
    await page.getByTestId('response-tab-test_results').click();
    const result = page.getByTestId('test-result-item').nth(0);
    await expect(result.getByTestId('test-result-status')).toContainText('PASS');
  });
});

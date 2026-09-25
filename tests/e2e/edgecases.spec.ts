import { test, expect } from '@playwright/test';

test.describe('Edge Cases', () => {
  test('Strip JSON comments from request body', async ({ page }) => {
    // Register and login
    const timestamp = Date.now();
    const email = `edge_${timestamp}@example.com`;
    const pass = 'password123';
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Edge User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill(pass);
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // Mock response to verify request body
    let requestBodyReceived = null;
    await page.route('**/proxy', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const postData = request.postDataJSON();
        requestBodyReceived = postData?.body;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 200,
            statusText: 'OK',
            headers: {},
            body: { success: true },
            time: 10,
            size: 100
          }),
        });
        return;
      }
      await route.continue();
    });

    // Create Request
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('https://example.com/api');
    
    // Select Body tab
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-raw').click();
    
    // Make sure JSON is selected
    await page.getByTestId('body-raw-language-select').selectOption('json');

    // Type JSON with comments in Monaco
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    const jsonWithComments = `{
      // This is a comment
      "key": "value",
      /* Block comment */
      "number": 42
    }`;
    await page.keyboard.insertText(jsonWithComments);

    // Send request
    await page.getByTestId('request-send-btn').click();

    // Verify response arrives
    await expect(page.getByTestId('monaco-editor-container').last()).toContainText('success');

    // Verify the stripped request body
    expect(requestBodyReceived).not.toBeNull();
    const parsedBody = JSON.parse(requestBodyReceived);
    expect(parsedBody.key).toBe('value');
    expect(parsedBody.number).toBe(42);
    expect(requestBodyReceived).not.toContain('// This is a comment');
    expect(requestBodyReceived).not.toContain('/* Block comment */');
  });
});

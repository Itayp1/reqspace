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

    // Mock the actual target — there is no server-side proxy relay, the
    // browser transport does a direct fetch(url).
    let requestBodyReceived: string | null = null;
    await page.route('**/api', async (route) => {
      requestBodyReceived = route.request().postData();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Create Request
    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('https://example.com/api');
    
    // Select Body tab
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-raw').click();
    
    // Make sure JSON is selected
    await page.getByTestId('body-raw-language-select').selectOption('json');

    // Type JSON with comments in Monaco. Pasting (rather than typing
    // character-by-character) avoids Monaco's auto-closing-bracket and
    // auto-indent features mangling the text — typing a literal "{" or
    // Enter triggers those and produces extra braces/indentation.
    const jsonWithComments = `{
      // This is a comment
      "key": "value",
      /* Block comment */
      "number": 42
    }`;
    await page.getByTestId('monaco-editor-container').click();
    await page.keyboard.press('Control+A');
    await page.evaluate((text) => navigator.clipboard.writeText(text), jsonWithComments);
    await page.keyboard.press('Control+V');

    // Send request
    await page.getByTestId('request-send-btn').click();

    // Verify response arrives
    await expect(page.getByTestId('response-body-viewer')).toContainText('success');

    // Verify the stripped request body
    expect(requestBodyReceived).not.toBeNull();
    const parsedBody = JSON.parse(requestBodyReceived);
    expect(parsedBody.key).toBe('value');
    expect(parsedBody.number).toBe(42);
    expect(requestBodyReceived).not.toContain('// This is a comment');
    expect(requestBodyReceived).not.toContain('/* Block comment */');
  });
});

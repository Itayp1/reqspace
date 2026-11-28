import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';
import { mockServer, scene } from '../scene';


// Bug: a raw body whose language is JSON (the editor's default, shown as "json")
// was sent with no Content-Type header, so fetch() defaulted it to text/plain.
// The language dropdown only sets the header when it is changed explicitly.
test('a raw JSON body is sent with Content-Type application/json by default', async ({ page }) => {
  await registerUser(page, 'rawjson');
  await page.getByTestId('new-tab-btn').click();

  await page.getByTestId('method-select').selectOption('POST');
  await page.getByTestId('request-url-input').fill('http://localhost:12345/echo');
  await page.getByTestId('req-tab-body').click();
  await page.getByTestId('body-mode-raw').click();
  await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
  await page.keyboard.type('{"test": "data"}');

  await page.route('**/echo', (route) => route.fulfill({ status: 200, body: 'ok' }));
  const sent = page.waitForRequest((r) => r.url().includes('/echo'));
  await page.getByTestId('request-send-btn').click();
  expect((await sent).headers()['content-type']).toBe('application/json');
});


const formBody = (rows: unknown[]) => ({
  method: 'POST',
  headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
  body: { mode: 'form-data', formData: rows },
});

// QA-50: a manual Content-Type header overrode the form-data mode, and empty form-data sent a boundary-only body.
test('QA-50: form-data is sent as multipart even with a manual Content-Type header', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page, formBody([{ key: 'a', value: '1', enabled: true, type: 'text' }]));
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.at(-1)!.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
});

test('QA-50: form-data with no rows sends no body', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page, formBody([]));
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.at(-1)!.body).toBeNull();
});


// QA-41: params saved on a request were not sent when the stored URL has no query string.
test('QA-41: saved enabled params are sent when the URL has no query', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page, {
    url: 'https://mock.test/params-only',
    params: [{ key: 'p1', value: 'a', enabled: true }, { key: 'p2', value: 'b', enabled: true }, { key: 'off', value: 'x', enabled: false }],
  });
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.at(-1)!.url).toBe('https://mock.test/params-only?p1=a&p2=b');
});


test.describe('Edge Cases', () => {
  test('Strip JSON comments from request body', async ({ page }) => {
    // Register and login
    await registerUser(page, 'edge', 'Edge User');

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
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
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

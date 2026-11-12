import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

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

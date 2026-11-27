import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';
import { parseCurl } from '../../../server/src/utils/curlParser';

async function openImport(page: import('@playwright/test').Page) {
  await page.getByTestId('import-btn').click();
  await expect(page.getByTestId('import-submit')).toBeVisible();
}

test.describe('Import', () => {
  test('cURL and raw HTTP imports open a ready-to-send tab', async ({ page }) => {
    await registerUser(page, 'import_curl');
    await openImport(page);
    await page.getByTestId('import-tab-curl').click();
    await page.getByTestId('import-curl-input').fill(`curl -X PUT "https://curl.example.test/items/7" -H "Content-Type: application/json" -H "X-Req: yes" -d '{"a":1}'`);
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('method-select')).toHaveValue('PUT');
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://curl.example.test/items/7');
    await page.getByTestId('req-tab-headers').click();
    await expect(page.getByTestId('kv-key-1')).toHaveValue('X-Req');

    await openImport(page);
    await page.getByTestId('import-tab-raw').click();
    await page.getByTestId('import-raw-input').fill('PATCH /api/users/3 HTTP/1.1\nHost: raw.example.test\nX-Raw: 1\n\n{"name":"z"}');
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('method-select')).toHaveValue('PATCH');
    await expect(page.getByTestId('request-url-input')).toHaveValue('http://raw.example.test/api/users/3');
  });

  test('cURL import rejects input that is clearly not a cURL command', async ({ page }) => {
    await registerUser(page, 'import_curl_bad');
    await openImport(page);
    await page.getByTestId('import-tab-curl').click();
    await page.getByTestId('import-curl-input').fill('hello world, not a command');
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('import-error')).toContainText('Not a valid cURL command');
    await page.getByTestId('import-curl-input').fill('curl -X GET');
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('import-error')).toContainText('include a URL');
  });
});

/** QA-70: Import stayed enabled for a cURL command with an unclosed quote. */
test('cURL import is disabled with a parse error until the command is valid', async ({ page }) => {
  await registerUser(page, 'curl_bad');
  await page.getByTestId('import-btn').click();
  await page.getByTestId('import-tab-curl').click();
  await page.getByTestId('import-curl-input').fill("curl -X GET http://curl.example.test/x -H 'X-Probe: 1");
  await expect(page.getByTestId('import-submit')).toBeDisabled();
  await expect(page.getByTestId('import-curl-error')).toContainText('Unclosed');

  await page.getByTestId('import-curl-input').fill("curl -X GET http://curl.example.test/x -H 'X-Probe: 1'");
  await expect(page.getByTestId('import-submit')).toBeEnabled();
});

// parseCurl is a pure function, so this needs no browser or server. BUG-05/07/08 are covered by
// server/src/tests/curlParser.test.ts; BUG-06 stays here for its `-XPUT` assertion.
test.describe('cURL import parser', () => {
  test('BUG-06: --request DELETE is honoured (long form of -X)', () => {
    expect(parseCurl('curl --request DELETE https://api.test/del').method).toBe('DELETE');
    expect(parseCurl('curl -XPUT https://api.test/p').method).toBe('PUT');
  });
});

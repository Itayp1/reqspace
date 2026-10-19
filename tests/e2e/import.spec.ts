import { test, expect } from './fixtures';
import fs from 'fs';
import { registerUser, treeNode, openNodeMenu, expectToast } from './helpers';

/**
 * Import > File / OpenAPI / cURL / Raw HTTP, and the export → import round
 * trips for collections and environments.
 *
 * Collection-file import used to keep only request names: every request came
 * back as `GET https://example.com` with no folders, headers, body or
 * scripts. An environment exported from the app was detected as a collection
 * and could not be imported back at all.
 */
test.describe('Import', () => {
  const POSTMAN = {
    info: { name: 'Imported Pets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [{ key: 'base', value: 'https://pets.example.test' }],
    item: [
      {
        name: 'Pets Folder',
        item: [
          {
            name: 'Create Pet',
            event: [{ listen: 'test', script: { exec: ['pm.test("created", () => {});'] } }],
            request: {
              method: 'POST',
              url: { raw: '{{base}}/pets', host: ['{{base}}'], path: ['pets'] },
              header: [{ key: 'X-Trace', value: 'abc' }],
              body: { mode: 'raw', raw: '{"name":"rex"}', options: { raw: { language: 'json' } } },
            },
          },
          { name: 'Inner Folder', item: [{ name: 'Delete Pet', request: { method: 'DELETE', url: '{{base}}/pets/1' } }] },
        ],
      },
      { name: 'List Pets', request: { method: 'GET', url: '{{base}}/pets?limit=5' } },
    ],
  };

  async function openImport(page: import('@playwright/test').Page) {
    await page.getByTestId('import-btn').click();
    await expect(page.getByTestId('import-submit')).toBeVisible();
  }

  test('a Postman collection file imports with its folders, methods, URLs, headers, body and scripts', async ({ page }) => {
    await registerUser(page, 'import_file');
    await openImport(page);
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'pets.postman_collection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(POSTMAN)),
    });
    await expect(page.getByTestId('import-detected-format')).toHaveText('ReqSpace Collection');
    await page.getByTestId('import-submit').click();
    await expectToast(page, 'success', 'Imported 3 request(s) in 2 folder(s)');

    // The collection is opened after import; the folder tree is real.
    await expect(page.getByTestId('node-Imported Pets')).toBeVisible();
    await expect(page.getByTestId('node-List Pets')).toBeVisible();
    await treeNode(page, 'Pets Folder').click();
    await expect(page.getByTestId('node-Create Pet')).toBeVisible();
    await treeNode(page, 'Inner Folder').click();
    await expect(page.getByTestId('node-Delete Pet')).toBeVisible();

    await treeNode(page, 'Create Pet').click();
    await expect(page.getByTestId('method-select')).toHaveValue('POST');
    await expect(page.getByTestId('request-url-input')).toHaveValue('{{base}}/pets');
    await page.getByTestId('req-tab-headers').click();
    await expect(page.getByTestId('kv-key-0')).toHaveValue('X-Trace');
    await expect(page.getByTestId('kv-val-0')).toHaveValue('abc');
    await page.getByTestId('req-tab-tests').click();
    await expect(page.locator('.monaco-editor').first()).toContainText('pm.test("created"');

    await treeNode(page, 'Delete Pet').click();
    await expect(page.getByTestId('method-select')).toHaveValue('DELETE');
    await expect(page.getByTestId('request-url-input')).toHaveValue('{{base}}/pets/1');
  });

  test('an exported collection imports back as an identical copy', async ({ page }) => {
    await registerUser(page, 'import_roundtrip');
    await openImport(page);
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'pets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(POSTMAN)),
    });
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('node-Imported Pets')).toBeVisible();

    await openNodeMenu(page, 'Imported Pets');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('action-menu-export').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(exported.info.schema).toContain('schema.getpostman.com');
    expect(JSON.stringify(exported)).toContain('Delete Pet');

    await openImport(page);
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page.getByTestId('import-submit').click();
    await expectToast(page, 'success', 'Imported 3 request(s) in 2 folder(s)');
    await expect(page.getByTestId('node-Imported Pets')).toHaveCount(1);
    await expect(page.getByTestId('node-Imported Pets (2)')).toBeVisible(); // duplicate collection names are de-duplicated
  });

  test('a pasted OpenAPI spec becomes a collection with a folder per tag', async ({ page }) => {
    await registerUser(page, 'import_openapi');
    await openImport(page);
    await page.getByTestId('import-tab-openapi').click();
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Mini Store API', version: '1.0.0' },
      servers: [{ url: 'https://store.example.test/v1' }],
      paths: {
        '/orders': {
          get: { tags: ['orders'], summary: 'List orders', parameters: [{ name: 'page', in: 'query', schema: { default: 1 } }] },
          post: { tags: ['orders'], summary: 'Create order', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { qty: { type: 'integer' } } } } } } },
        },
      },
    };
    await page.getByTestId('import-openapi-input').fill(JSON.stringify(spec, null, 2));
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('node-Mini Store API')).toBeVisible();
    await treeNode(page, 'orders').click();
    await expect(page.getByTestId('node-List orders')).toBeVisible();
    await treeNode(page, 'Create order').click();
    await expect(page.getByTestId('method-select')).toHaveValue('POST');
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://store.example.test/v1/orders');
  });

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

  test('a file that is not a collection is rejected with a message', async ({ page }) => {
    await registerUser(page, 'import_bad');
    await openImport(page);
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
    });
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('import-error')).toContainText(/Not a Postman\/reqSpace collection/);
  });

  test('an exported environment imports back with its variables', async ({ page }) => {
    await registerUser(page, 'import_env');
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Exported Env');
    await page.getByTestId('prompt-submit').click();
    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill('apiHost');
    await page.getByTestId('env-var-initial-0').fill('https://env.example.test');
    await page.getByTestId('env-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('env-export-btn').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(exported.values).toEqual([expect.objectContaining({ key: 'apiHost', value: 'https://env.example.test' })]);

    await openImport(page);
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'env.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)),
    });
    await expect(page.getByTestId('import-detected-format')).toHaveText('ReqSpace Environment');
    await page.getByTestId('import-submit').click();
    // Imported as a second environment, opened in its own tab with the variable.
    await expect(page.getByTestId('env-node-Exported Env')).toHaveCount(2);
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('apiHost');
  });
});

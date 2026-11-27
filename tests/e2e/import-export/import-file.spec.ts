import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'fs';
import { registerUser, treeNode, openNodeMenu, expectToast } from '../helpers';

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
    await page.getByTestId('prompt-input').press('Enter');
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

  test('dropping a JSON file anywhere opens Import with it, environments included', async ({ page }) => {
    await registerUser(page, 'import_drop');
    const env = { name: 'Dropped Env', values: [{ key: 'host', value: 'x', enabled: true }], _postman_variable_scope: 'environment' };
    const dt = await page.evaluateHandle((json) => {
      const d = new DataTransfer();
      d.items.add(new File([json], 'env.json', { type: 'application/json' }));
      return d;
    }, JSON.stringify(env));
    await page.dispatchEvent('main', 'drop', { dataTransfer: dt });
    await expect(page.getByTestId('import-detected-format')).toHaveText('ReqSpace Environment');
    await page.getByTestId('import-submit').click();
    await page.getByTestId('tab-environments').click();
    await expect(page.getByTestId('env-node-Dropped Env')).toHaveCount(1);
  });

  test('import shows the detected name and imports under the edited one', async ({ page }) => {
    await registerUser(page, 'import_rename');
    await openImport(page);
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'c.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ info: { name: 'Original Name', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [] })),
    });
    await expect(page.getByTestId('import-name-0')).toHaveValue('Original Name');
    await page.getByTestId('import-name-0').fill('Renamed On Import');
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('node-Renamed On Import')).toBeVisible();
    await expect(page.getByTestId('node-Original Name')).toHaveCount(0);
  });
});

test.describe('Collection, OpenAPI and WSDL import (manual-test regressions)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]|Error parsing data file/] });

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const idOf = (o: any) => (o.id ?? o._id) as string;

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }
  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    const wsList = await (await ctx.get('/api/workspaces')).json();
    const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
    const user = { ctx, email, wsId: idOf(ws) };
    userByEmail.set(email, user);
    return user;
  }
  type U = Awaited<ReturnType<typeof newUser>>;

  /** Login rate limit (15/15min per IP) makes UI logins unusable here: reuse the API session cookie instead. */
  const sessions = new Map<string, any[]>();
  async function loginUi(page: Page, email: string) {
    const u = userByEmail.get(email)!;
    if (!sessions.has(email)) sessions.set(email, (await u.ctx.storageState()).cookies);
    await page.context().addCookies(sessions.get(email)!);
    await page.goto('/');
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }
  const userByEmail = new Map<string, any>();


    const postman = (name: string) => ({ info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ name: 'r', request: { method: 'GET', url: 'http://x.test' } }] });

    const spec = `openapi: "3.0.0"
info: { title: Sec API, version: "1" }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    User:
      type: object
      properties: { name: { type: string }, age: { type: integer } }
security: [ { bearerAuth: [] } ]
paths:
  /users:
    post:
      summary: Create user
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/User' }
      responses: { '200': { description: ok } }
`;
    async function importOpenApiViaUi(page: Page, u: U) {
      await loginUi(page, u.email);
      await page.getByTestId('import-btn').click();
      await page.getByTestId('import-tab-openapi').click();
      await page.getByTestId('import-openapi-input').fill(spec);
      await page.getByTestId('import-submit').click();
      await expect.poll(async () => (await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json()).length, {
        message: 'import error: ' + (await page.getByTestId('import-error').textContent({ timeout: 100 }).catch(() => 'none')),
        timeout: 8000,
      }).toBe(1);
      await page.waitForTimeout(1500);
      const cols = await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json();
      const col = cols.find((c: any) => c.name === 'Sec API');
      expect(col).toBeTruthy();
      const reqs = await (await u.ctx.get(`/api/collections/${idOf(col)}/requests`)).json();
      return { col, reqs };
    }


  test('[L1.9] importing the same file twice yields unique collection names', async () => {
    const u = await newUser('l19');
    for (let i = 0; i < 2; i++) {
      const res = await u.ctx.post('/api/collections/import', { data: { workspaceId: u.wsId, collection: postman('Dup') } });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
    const cols = await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json();
    const names = cols.map((c: any) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(2);
  });

  test('[L1.10] import dialog accepts multiple files', async ({ page }) => {
    const u = await newUser('l110');
    await loginUi(page, u.email);
    await page.getByTestId('import-btn').click();
    await expect(page.getByTestId('import-file-input')).toHaveAttribute('multiple', /.*/);
  });

  test('[L2.1] OpenAPI YAML import creates the request with servers/paths', async ({ page }) => {
    const u = await newUser('l21');
    const { reqs } = await importOpenApiViaUi(page, u);
    expect(reqs.length).toBe(1);
    expect(reqs[0].method).toBe('POST');
    expect(reqs[0].url).toContain('/users');
  });

  test('[L2.3] OpenAPI import maps securitySchemes to request auth', async ({ page }) => {
    const u = await newUser('l23');
    const { col, reqs } = await importOpenApiViaUi(page, u);
    const effective = reqs[0].auth?.type && reqs[0].auth.type !== 'none' ? reqs[0].auth : col.auth;
    expect(effective?.type).toBe('bearer');
  });

  test('[L2.4] OpenAPI import resolves $ref in requestBody into a sample body', async ({ page }) => {
    const u = await newUser('l24');
    const { reqs } = await importOpenApiViaUi(page, u);
    const raw = JSON.parse(reqs[0].body?.raw || '{}');
    expect(Object.keys(raw)).toEqual(expect.arrayContaining(['name', 'age']));
  });

  test('[L4.5] WSDL import accepts pasted/uploaded document, not just URL', async ({ page }) => {
    const u = await newUser('l45');
    await loginUi(page, u.email);
    await page.getByTestId('import-btn').click();
    await page.getByTestId('import-tab-wsdl').click();
    await expect(page.getByTestId('import-wsdl-text')).toBeVisible();
    await expect(page.getByTestId('import-wsdl-file')).toBeAttached();
  });
});

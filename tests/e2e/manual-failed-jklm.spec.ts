import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL } from './fixtures';
import { apiAsAdmin, openNodeMenu } from './helpers';
import fs from 'fs';

/**
 * Group 4 of MANUAL_TEST_PLAN_FAILED.md: J (runner), K (history), L (import/export), M (share/fork).
 * Titles start with the plan id ("[J1.4] ..."). A still-broken bug is marked test.fail().
 */

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
  // The server's CSRF check only whitelists the dev origin :5173; this run's client is on another port.
  await page.context().route('**/api/**', async (r) => {
    if (r.request().method() === 'GET') return r.fallback();
    const res = await r.fetch({ headers: { ...r.request().headers(), origin: 'http://localhost:5173' } });
    await r.fulfill({ response: res });
  });
  await page.goto('/');
  await expect(page.getByTestId('workspace-select')).toBeVisible();
}
const userByEmail = new Map<string, any>();

async function mkCollection(ctx: APIRequestContext, wsId: string, name: string, reqs: Array<Record<string, any>> = []) {
  const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name } })).json();
  const out: any[] = [];
  for (const r of reqs) {
    const res = await ctx.post(`/api/collections/${idOf(col)}/requests`, { data: { method: 'GET', ...r } });
    expect(res.ok(), 'create request ' + (await res.text())).toBeTruthy();
    out.push(await res.json());
  }
  return { colId: idOf(col), reqs: out };
}
async function openRunner(page: Page, name: string) {
  await openNodeMenu(page, name);
  await page.getByTestId('action-menu-run-collection').click();
  await expect(page.getByTestId('collection-runner-modal')).toBeVisible();
}
async function loginAndOpenRunner(page: Page, email: string, colName: string) {
  await loginUi(page, email);
  await openRunner(page, colName);
}
async function historyCount(ctx: APIRequestContext, wsId: string) {
  const b = await (await ctx.get(`/api/workspaces/${wsId}/history?limit=200`)).json();
  return (b.total ?? b.items.length) as number;
}
const hist = (status = 200, extra: Record<string, any> = {}) => ({
  requestSnapshot: { method: 'GET', url: 'http://h.test/x', headers: [], body: { mode: 'none' } },
  responseBody: 'ok', responseStatus: status, responseStatusText: 'OK', responseHeaders: {}, responseTime: 5, responseSize: 2, ...extra,
});

test.describe('J — runner', () => {
  test('[J1.4] iterations field refuses negative, zero and huge values', async ({ page }) => {
    const u = await newUser('j14');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }]);
    await loginAndOpenRunner(page, u.email, 'RunCol');
    const it = page.getByTestId('collection-runner-iterations');
    const run = page.getByTestId('collection-runner-run-btn');
    for (const bad of ['-5', '0', '99999']) {
      await it.fill(bad);
      await expect(run, bad).toBeDisabled();
      await expect(page.getByTestId('collection-runner-iterations-error'), bad).toBeVisible();
    }
    await it.fill('2');
    await expect(run).toBeEnabled();
  });

  test('[J1.9] runner can run a subset of requests (checkboxes)', async ({ page }) => {
    const u = await newUser('j19');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [
      { name: 'A', url: 'http://runner-test.local/a' }, { name: 'B', url: 'http://runner-test.local/b' }]);
    const hits: string[] = [];
    await page.route('http://runner-test.local/*', async (r) => { hits.push(new URL(r.request().url()).pathname); await r.fulfill({ status: 200, body: 'ok' }); });
    await loginAndOpenRunner(page, u.email, 'RunCol');
    const boxes = page.getByTestId('collection-runner-select');
    await expect(boxes).toHaveCount(2);
    await boxes.nth(1).uncheck();
    await page.getByTestId('collection-runner-run-btn').click();
    await expect(page.getByTestId('collection-runner-row')).toHaveCount(1);
    await expect.poll(() => hits.length).toBe(1);
    expect(hits).toEqual(['/a']);
  });

  test('[J1.12] a collection run is recorded in History', async ({ page }) => {
    const u = await newUser('j112');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }, { name: 'B', url: 'http://runner-test.local/b' }]);
    await page.route('http://runner-test.local/*', (r) => r.fulfill({ status: 200, body: 'ok' }));
    await loginAndOpenRunner(page, u.email, 'RunCol');
    const before = await historyCount(u.ctx, u.wsId);
    await page.getByTestId('collection-runner-run-btn').click();
    await expect(page.getByTestId('collection-runner-export-btn')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await historyCount(u.ctx, u.wsId)).toBe(before + 2);
  });

  test('[J1.13] runner offers Export Results after a run, producing a JSON download', async ({ page }) => {
    const u = await newUser('j113');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }]);
    await page.route('http://runner-test.local/*', (r) => r.fulfill({ status: 200, body: 'ok' }));
    await loginAndOpenRunner(page, u.email, 'RunCol');
    await page.getByTestId('collection-runner-run-btn').click();
    const dl = page.waitForEvent('download');
    await page.getByTestId('collection-runner-export-btn').click();
    const file = await (await dl).path();
    const json = JSON.parse(fs.readFileSync(file!, 'utf8'));
    expect(json.results.length).toBe(1);
    expect(json.results[0].status).toBe(200);
  });

  test('[J2.1] with 3 iterations the runner lists a row per iteration', async ({ page }) => {
    const u = await newUser('j21');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }]);
    await page.route('http://runner-test.local/*', (r) => r.fulfill({ status: 200, body: 'ok' }));
    await loginAndOpenRunner(page, u.email, 'RunCol');
    await page.getByTestId('collection-runner-iterations').fill('3');
    await page.getByTestId('collection-runner-run-btn').click();
    const rows = page.getByTestId('collection-runner-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText('200');
    await expect(rows.nth(2)).toContainText('Iter 3');
  });

  test('[J2.2] CSV data file with quoted commas and CRLF is parsed correctly', async ({ page }) => {
    const u = await newUser('j22');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/echo?n={{name}}&c={{city}}' }]);
    const seen: string[] = [];
    await page.route('http://runner-test.local/*', async (r) => { seen.push(new URL(r.request().url()).search); await r.fulfill({ status: 200, body: 'ok' }); });
    await loginAndOpenRunner(page, u.email, 'RunCol');
    await page.getByTestId('collection-runner-data-file').setInputFiles({
      name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from('name,city\r\n"Doe, John",Paris\r\nAnn,Rome\r\n'),
    });
    await expect(page.getByTestId('collection-runner-iterations')).toHaveValue('2');
    await page.getByTestId('collection-runner-run-btn').click();
    await expect.poll(() => seen.length).toBe(2);
    expect(decodeURIComponent(seen[0].replace(/\+/g, ' '))).toBe('?n=Doe, John&c=Paris');
    expect(seen[1]).toBe('?n=Ann&c=Rome');
  });

  test('[J2.4] a broken data file shows an error to the user', async ({ page }) => {
    const u = await newUser('j24');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }]);
    await loginAndOpenRunner(page, u.email, 'RunCol');
    await page.getByTestId('collection-runner-data-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
    await expect(page.getByTestId('collection-runner-data-file-error')).toBeVisible();
  });

  test('[J2.6] a loaded data file can be removed without reopening the modal', async ({ page }) => {
    const u = await newUser('j26');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }]);
    await loginAndOpenRunner(page, u.email, 'RunCol');
    await page.getByTestId('collection-runner-data-file').setInputFiles({ name: 'd.json', mimeType: 'application/json', buffer: Buffer.from('[{"a":1},{"a":2}]') });
    await expect(page.getByTestId('collection-runner-iterations')).toHaveValue('2');
    await page.getByTestId('collection-runner-clear-data-file').click();
    await expect(page.getByTestId('collection-runner-clear-data-file')).toHaveCount(0);
    await expect(page.getByTestId('collection-runner-iterations')).toHaveValue('1');
  });

  test('[J3.1] Stop aborts the in-flight request immediately', async ({ page }) => {
    const u = await newUser('j31');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'Slow', url: 'http://runner-test.local/slow' }]);
    await page.route('http://runner-test.local/*', async (r) => { await new Promise((res) => setTimeout(res, 15000)); await r.fulfill({ status: 200, body: 'late' }).catch(() => {}); });
    await loginAndOpenRunner(page, u.email, 'RunCol');
    await page.getByTestId('collection-runner-run-btn').click();
    await page.getByTestId('collection-runner-stop-btn').click();
    await expect(page.getByTestId('collection-runner-run-btn')).toBeVisible({ timeout: 2000 });
  });

  test('[J3.2] Stop interrupts the delay between requests immediately', async ({ page }) => {
    const u = await newUser('j32');
    await mkCollection(u.ctx, u.wsId, 'RunCol', [{ name: 'A', url: 'http://runner-test.local/a' }, { name: 'B', url: 'http://runner-test.local/b' }]);
    await page.route('http://runner-test.local/*', (r) => r.fulfill({ status: 200, body: 'ok' }));
    await loginAndOpenRunner(page, u.email, 'RunCol');
    await page.locator('input[type="number"]').first().fill('8000');
    await page.getByTestId('collection-runner-run-btn').click();
    await expect(page.getByTestId('collection-runner-row').first()).toContainText('200');
    await page.getByTestId('collection-runner-stop-btn').click();
    await expect(page.getByTestId('collection-runner-run-btn')).toBeVisible({ timeout: 2000 });
  });
});

test.describe('K — history', () => {
  test('[K1.4] history UI pages through >50 entries (Load more) instead of loading only page 1', async ({ page }) => {
    const u = await newUser('k14');
    for (let i = 0; i < 60; i++) {
      await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist(200, { requestSnapshot: { method: 'GET', url: `http://h.test/${i}`, headers: [], body: { mode: 'none' } } }) });
    }
    await loginUi(page, u.email);
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item').first()).toBeVisible();
    expect(await page.getByTestId('history-item').count()).toBeLessThanOrEqual(50);
    await page.getByTestId('history-load-more').click();
    await expect(page.getByTestId('history-item')).toHaveCount(60);
  });

  test('[K1.7] a request that fails on the network is recorded in History', async ({ page }) => {
    const u = await newUser('k17');
    await page.route('http://down.test/**', (r) => r.abort('connectionrefused'));
    await loginUi(page, u.email);
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('http://down.test/x');
    await page.getByTestId('request-send-btn').click();
    await expect.poll(() => historyCount(u.ctx, u.wsId), { timeout: 8000 }).toBe(1);
  });

  test('[K1.9] a request sent in one tab appears in the History panel of another open tab', async ({ page, context }) => {
    test.skip(process.env.REQSPACE_TARGET === 'electron', 'needs a second page in one context; an Electron app context cannot create pages via CDP');
    const u = await newUser('k19');
    await context.route('http://sync.test/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
    await loginUi(page, u.email);
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByTestId('workspace-select')).toBeVisible();
    await other.getByTestId('tab-history').click();
    await expect(other.getByTestId('history-item')).toHaveCount(0);
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('http://sync.test/ping');
    await page.getByTestId('request-send-btn').click();
    await expect(other.getByTestId('history-item').first()).toBeVisible({ timeout: 8000 });
  });

  test('[K2.4] two simultaneous saves of one history row do not create two requests', async () => {
    const u = await newUser('k24');
    const { colId } = await mkCollection(u.ctx, u.wsId, 'C');
    await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist() });
    const item = (await (await u.ctx.get(`/api/workspaces/${u.wsId}/history`)).json()).items[0];
    const body = { collectionId: colId, name: 'Saved once' };
    const [a, b] = await Promise.all([u.ctx.post(`/api/history/${idOf(item)}/save`, { data: body }), u.ctx.post(`/api/history/${idOf(item)}/save`, { data: body })]);
    expect(a.status(), await a.text()).toBeLessThan(300);
    const reqs = await (await u.ctx.get(`/api/collections/${colId}/requests`)).json();
    expect(reqs.filter((r: any) => r.name === 'Saved once').length, `${a.status()}/${b.status()}`).toBe(1);
  });

  test('[K3.2] a huge response body is truncated in history', async () => {
    const u = await newUser('k32');
    await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist(200, { responseBody: 'x'.repeat(3 * 1024 * 1024), responseSize: 3 * 1024 * 1024 }) });
    const item = (await (await u.ctx.get(`/api/workspaces/${u.wsId}/history`)).json()).items[0];
    const full = await (await u.ctx.get(`/api/history/${idOf(item)}`)).json();
    // The configured cap is 1 MB; the row exposes the same body twice (responseData / responseSnapshot).
    expect(JSON.stringify(full.responseData).length).toBeLessThan(1.2 * 1024 * 1024);
    expect(JSON.stringify(full.responseData)).toContain('[truncated]');
  });

  test('[K3.3] a 1 MB file in form-data is not stored as full base64 in history', async () => {
    const u = await newUser('k33');
    const b64 = Buffer.alloc(1024 * 1024, 7).toString('base64');
    const snap = { method: 'POST', url: 'http://h.test/up', headers: [], body: { mode: 'form-data', formData: [{ key: 'f', type: 'file', fileName: 'a.bin', value: b64, enabled: true }] } };
    await u.ctx.post(`/api/workspaces/${u.wsId}/history`, { data: hist(200, { requestSnapshot: snap }) });
    const item = (await (await u.ctx.get(`/api/workspaces/${u.wsId}/history`)).json()).items[0];
    const full = await (await u.ctx.get(`/api/history/${idOf(item)}`)).json();
    expect(JSON.stringify(full).length).toBeLessThan(200 * 1024);
  });

  test('[K4.3] saving history can be switched off in Global Settings', async ({ page }) => {
    const u = await newUser('k43');
    await page.route('http://off.test/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
    await loginUi(page, u.email);
    await page.getByTestId('settings-btn').click();
    const toggle = page.locator('#saveHistory');
    await expect(toggle).toBeVisible();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await page.getByTestId('global-settings-close-btn').click();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('http://off.test/x');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    await page.waitForTimeout(800);
    expect(await historyCount(u.ctx, u.wsId)).toBe(0);
  });
});

test.describe('L — import / export', () => {
  const postman = (name: string) => ({ info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ name: 'r', request: { method: 'GET', url: 'http://x.test' } }] });

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

  async function curl(ctx: APIRequestContext, wsId: string, c: string) {
    const res = await ctx.post('/api/requests/import/curl', { data: { workspaceId: wsId, curl: c } });
    expect(res.status()).toBe(200);
    return res.json();
  }
  test('[L3.1] cURL import: POST + header + JSON body', async () => {
    const u = await newUser('l31');
    const r = await curl(u.ctx, u.wsId, `curl -X POST https://api.test/x -H "A: b" -d '{"x":1}'`);
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.test/x');
    expect(r.headers.some((h: any) => h.key === 'A' && h.value === 'b')).toBeTruthy();
    expect(r.body.raw).toBe('{"x":1}');
  });
  test('[L3.4] cURL import supports -F form-data', async () => {
    const u = await newUser('l34');
    const r = await curl(u.ctx, u.wsId, `curl -F 'name=x' -F 'k=v' https://api.test/f`);
    expect(r.method).toBe('POST');
    expect(r.body.mode).toBe('form-data');
    expect(JSON.stringify(r.body)).toContain('"name"');
  });
  test('[L3.5] cURL import turns -u into basic auth', async () => {
    const u = await newUser('l35');
    const r = await curl(u.ctx, u.wsId, `curl -u user:pass https://api.test/basic`);
    const viaAuth = r.auth?.type === 'basic' && r.auth.basic?.username === 'user' && r.auth.basic?.password === 'pass';
    const viaHeader = (r.headers || []).some((h: any) => /authorization/i.test(h.key) && h.value === 'Basic ' + Buffer.from('user:pass').toString('base64'));
    expect(viaAuth || viaHeader).toBeTruthy();
  });
  test('[L3.6] pasting a cURL command into the URL bar fills the URL', async ({ page }) => {
    const u = await newUser('l36');
    await loginUi(page, u.email);
    await page.getByTestId('new-tab-btn').click();
    const input = page.getByTestId('request-url-input');
    await input.click();
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="request-url-input"]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', 'curl -X POST https://paste.test/api -H "X-A: 1"');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(input).toHaveValue('https://paste.test/api');
  });
  test('[L4.5] WSDL import accepts pasted/uploaded document, not just URL', async ({ page }) => {
    const u = await newUser('l45');
    await loginUi(page, u.email);
    await page.getByTestId('import-btn').click();
    await page.getByTestId('import-tab-wsdl').click();
    await expect(page.getByTestId('import-wsdl-text')).toBeVisible();
    await expect(page.getByTestId('import-wsdl-file')).toBeAttached();
  });

  test('[L5.3] importing a workspace dump into a non-empty workspace needs an explicit mode', async () => {
    const admin = await apiAsAdmin();
    const u = await newUser('l53');
    await mkCollection(u.ctx, u.wsId, 'Existing');
    const dump = await (await admin.get(`/api/admin/export/${u.wsId}`)).json();
    const res = await admin.post(`/api/admin/import/${u.wsId}`, { data: dump });
    expect(res.status()).toBe(409);
    const cols = await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json();
    expect(cols.length).toBe(1);
  });
  test('[L5.5] workspace dump does not contain secret variable values in plaintext by default', async () => {
    const admin = await apiAsAdmin();
    const u = await newUser('l55');
    const env = await u.ctx.post(`/api/workspaces/${u.wsId}/environments`, { data: { name: 'E', variables: [{ key: 'tok', value: 'S3CR3T-VALUE', isSecret: true, enabled: true }] } });
    expect(env.ok(), await env.text()).toBeTruthy();
    const text = await (await admin.get(`/api/admin/export/${u.wsId}`)).text();
    expect(text).not.toContain('S3CR3T-VALUE');
  });
});

test.describe('M — share & fork', () => {
  async function share(ctx: APIRequestContext, colId: string) {
    const res = await ctx.post(`/api/share/collection/${colId}`, { data: {} });
    expect(res.ok(), await res.text()).toBeTruthy();
    const b = await res.json();
    return (b.shortId ?? b.url?.split('/').pop()) as string;
  }

  test('[M1.2] public share view does not leak secrets from the URL query or auth', async () => {
    const u = await newUser('m12');
    const { colId } = await mkCollection(u.ctx, u.wsId, 'Shared', [{
      name: 'S', url: 'http://x.test/a?access_token=SUPERSECRET&q=1',
      auth: { type: 'bearer', bearer: { token: 'BEARERSECRET' } },
      headers: [{ key: 'Authorization', value: 'Bearer HDRSECRET', enabled: true }],
    }]);
    const id = await share(u.ctx, colId);
    const text = await (await (await anon()).get(`/api/share/${id}`)).text();
    for (const s of ['SUPERSECRET', 'BEARERSECRET', 'HDRSECRET']) expect(text, s).not.toContain(s);
  });

  test('[M1.3] anonymous holder of a share link cannot write', async () => {
    const u = await newUser('m13');
    const { colId, reqs } = await mkCollection(u.ctx, u.wsId, 'Shared', [{ name: 'S', url: 'http://x.test' }]);
    const id = await share(u.ctx, colId);
    const a = await anon();
    expect((await a.put(`/api/requests/${idOf(reqs[0])}`, { data: { name: 'hacked' } })).status()).toBe(401);
    expect((await a.delete(`/api/share/${id}`)).status()).toBe(401);
    expect((await a.post(`/api/share/collection/${colId}`, { data: {} })).status()).toBe(401);
  });

  test('[M1.3b] BUG-03: share links of a collection can be listed after the dialog closes', async () => {
    const u = await newUser('m13b');
    const { colId } = await mkCollection(u.ctx, u.wsId, 'Shared');
    const id = await share(u.ctx, colId);
    const res = await u.ctx.get(`/api/share/collection/${colId}/links`);
    expect(res.status()).toBe(200);
    expect(JSON.stringify(await res.json())).toContain(id);
  });

  test('[M1.7] invalid share ids (NUL byte, long, SQLi, traversal) answer 404, never 500', async () => {
    const a = await anon();
    for (const bad of ['%00', 'a'.repeat(1000), '%27%20OR%201=1--', '%2e%2e%2fadmin', 'zz%00zz']) {
      const res = await a.get(`/api/share/${bad}`);
      // A NUL byte in the path is rejected up front as a 400 (server/src/index.ts); the rest are plain 404s.
      // What this guards is "never 500".
      expect([400, 404], bad).toContain(res.status());
    }
  });

  test('[M1.14] share page shows a Fork button to a logged-in user and forks', async ({ page }) => {
    const u = await newUser('m114');
    const { colId } = await mkCollection(u.ctx, u.wsId, 'Shared', [{ name: 'S', url: 'http://x.test' }]);
    const id = await share(u.ctx, colId);
    await loginUi(page, u.email);
    await page.goto(`/share/${id}`);
    await expect(page.getByTestId('share-page-fork')).toBeVisible();
    await page.getByTestId('share-page-fork').click();
    await expect.poll(async () => (await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json()).length).toBe(2);
  });

  test('[M2.6] a second fork of the same source collection succeeds (no 500)', async () => {
    const u = await newUser('m26');
    const w1 = await (await u.ctx.post('/api/workspaces', { data: { name: uniq('team') } })).json();
    const { colId } = await mkCollection(u.ctx, idOf(w1), 'Src', [{ name: 'S', url: 'http://x.test' }]);
    for (let i = 0; i < 2; i++) {
      const res = await u.ctx.post(`/api/collections/${colId}/fork`, { data: { targetWorkspaceId: u.wsId, name: `Fork ${i}` } });
      expect(res.status(), await res.text()).toBe(201);
    }
  });

  test('[M3.1] fork options work from a team workspace into the admin personal workspace', async () => {
    const admin = await apiAsAdmin();
    const wsList = await (await admin.get('/api/workspaces')).json();
    const personal = wsList.find((w: any) => w.isPersonal);
    expect(personal, 'admin has a personal workspace').toBeTruthy();
    const team = await (await admin.post('/api/workspaces', { data: { name: uniq('team') } })).json();
    const { colId } = await mkCollection(admin, idOf(team), 'TeamSrc', [{ name: 'S', url: 'http://x.test' }]);
    const res = await admin.post(`/api/collections/${colId}/fork`, { data: { targetWorkspaceId: idOf(personal), name: uniq('forkM31') } });
    expect(res.status(), await res.text()).toBe(201);
  });
});

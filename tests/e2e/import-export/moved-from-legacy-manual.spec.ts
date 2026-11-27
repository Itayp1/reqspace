import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { apiAsAdmin, openNodeMenu } from '../helpers';
import fs from 'fs';

test.describe('moved from legacy-manual (jklm)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]|Error parsing data file/] });

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
      // The page may close mid-flight; an unhandled rejection here fails the whole run outside any test.
      try { const res = await r.fetch({ headers: { ...r.request().headers(), origin: 'http://localhost:5173' } }); await r.fulfill({ response: res }); } catch { /* page closed */ }
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

  test.describe('L — import / export', () => {
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

    async function curl(ctx: APIRequestContext, wsId: string, c: string) {
      const res = await ctx.post('/api/requests/import/curl', { data: { workspaceId: wsId, curl: c } });
      expect(res.status()).toBe(200);
      return res.json();
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
  });

});

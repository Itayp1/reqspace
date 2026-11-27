import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type Page, type APIRequestContext } from '@playwright/test';
import { registerUser } from '../helpers';

test.describe('moved from legacy-manual (efgi)', () => {
  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

  type Seen = { url: string; method: string; headers: Record<string, string>; body: string | null };

  /** Routes https://mock.test/** (answers CORS too) and records what the browser actually sent. */
  async function mockServer(page: Page, respond?: (url: URL) => { status?: number; contentType?: string; body: string | Buffer; headers?: Record<string, string> }) {
    const seen: Seen[] = [];
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    await page.route('https://mock.test/**', async (route) => {
      const r = route.request();
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      seen.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() });
      const out = respond ? respond(new URL(r.url())) : { body: '{"ok":true}' };
      return route.fulfill({ status: out.status ?? 200, contentType: out.contentType ?? 'application/json', body: out.body, headers: { ...cors, ...(out.headers || {}) } });
    });
    return seen;
  }

  async function scene(page: Page, opts: { request: Record<string, unknown>; env?: Array<Record<string, unknown>>; reqName?: string }) {
    // The dev server only accepts the Origin of the default client port (5173); this run uses another port.
    await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed mid-request */ } });
    await registerUser(page, 'efgi');
    const wsList = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    const wsId = ws.id ?? ws._id;
    const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
    const colId = col.id ?? col._id;
    const reqName = opts.reqName ?? 'Req';
    const r = await page.request.post(`/api/collections/${colId}/requests`, { data: { name: reqName, method: 'GET', url: 'https://mock.test/x', ...opts.request } });
    expect(r.ok(), 'create request ' + (await r.text())).toBeTruthy();
    if (opts.env) {
      const e = await page.request.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'EnvA', variables: opts.env } });
      expect(e.ok()).toBeTruthy();
    }
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('node-Col').click();
    await page.getByTestId(`node-${reqName}`).click();
    if (opts.env) await page.getByTestId('env-select').selectOption({ label: 'EnvA' });
    return { wsId, colId };
  }

  const v = (key: string, val: string, extra: Record<string, unknown> = {}) => ({ key, value: val, initialValue: val, currentValue: val, enabled: true, ...extra });
  const send = async (page: Page) => { await page.getByTestId('request-send-btn').click(); };
  const status = (page: Page) => page.getByTestId('response-status');

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }
  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } });
    expect(res.status()).toBe(201);
    return { ctx, email };
  }

  test.describe('F — scripts', () => {
    test('[F1.1] environment/globals/collection/local variables set by a script are used in the same request', async ({ page }) => {
      const seen = await mockServer(page);
      await scene(page, {
        env: [v('seedv', 's')],
        request: {
          url: 'https://mock.test/x?a={{a}}&b={{b}}&c={{c}}',
          preRequestScript: "pm.environment.set('a','1'); pm.globals.set('b','2'); pm.collectionVariables.set('c','3'); pm.variables.set('d','4');",
        },
      });
      await send(page);
      await expect(status(page)).toContainText('200');
      const u = new URL(seen.at(-1)!.url);
      expect([u.searchParams.get('a'), u.searchParams.get('b'), u.searchParams.get('c')]).toEqual(['1', '2', '3']);
    });

    test('[F1.2] pm.request url/headers changed by a pre-request script are what gets sent', async ({ page }) => {
      const seen = await mockServer(page);
      await scene(page, { request: { preRequestScript: "pm.request.url = pm.request.url + '?scripted=1'; pm.request.headers['X-Scripted'] = 'yes';" } });
      await send(page);
      await expect(status(page)).toContainText('200');
      expect(seen.at(-1)!.url).toContain('scripted=1');
      expect(seen.at(-1)!.headers['x-scripted']).toBe('yes');
    });

    test('[F1.4] pm.environment.unset removes the variable before {{var}} is resolved', async ({ page }) => {
      const seen = await mockServer(page);
      await scene(page, {
        env: [v('f14var', 'seedval')],
        request: { url: 'https://mock.test/x?q={{f14var}}', preRequestScript: "pm.environment.unset('f14var');" },
      });
      await send(page);
      await expect(status(page)).toContainText('200');
      expect(decodeURIComponent(seen.at(-1)!.url)).not.toContain('seedval');
    });

    test('[F2.2] pm.response json()/text()/headers.get()/code/responseTime work; bad JSON throws inside pm.test', async ({ page }) => {
      await mockServer(page, () => ({ body: '{"a":{"b":7}}', headers: { 'x-custom': 'cv' } }));
      await scene(page, {
        request: {
          testScript: [
            "pm.test('json', () => pm.expect(pm.response.json().a.b).to.equal(7));",
            "pm.test('text', () => pm.expect(pm.response.text()).to.include('\"b\":7'));",
            "pm.test('header', () => pm.expect(pm.response.headers.get('X-Custom')).to.equal('cv'));",
            "pm.test('code', () => pm.expect(pm.response.code).to.equal(200));",
            "pm.test('time', () => pm.expect(pm.response.responseTime).to.be.a('number'));",
            "pm.test('bad json handled', () => { pm.expect(() => JSON.parse('{x')).to.throw(); });",
          ].join('\n'),
        },
      });
      await send(page);
      await expect(status(page)).toContainText('200');
      await page.getByTestId('response-tab-test_results').click();
      const items = page.getByTestId('test-result-item');
      await expect(items).toHaveCount(6);
      for (let i = 0; i < 6; i++) await expect(items.nth(i).getByTestId('test-result-status')).toHaveText('PASS');
    });

    test('[F4.6] console.log of circular objects, Symbol, undefined and huge values does not crash the script', async ({ page }) => {
      const seen = await mockServer(page);
      await scene(page, {
        request: {
          preRequestScript: "const o={}; o.self=o; console.log(o, Symbol('s'), undefined, null, function(){}); console.log('x'.repeat(50000)); console.log('last-line-ran');",
        },
      });
      await page.getByTestId('console-toggle-btn').click();
      await send(page);
      await expect(status(page)).toContainText('200');
      expect(seen.length).toBe(1);
      await expect(page.getByTestId('console-drawer')).toContainText('last-line-ran');
    });
  });

  test.describe('G — variables and environments', () => {
    test('[G5.2] pm.collectionVariables.set is usable by the same run (documented as run-scoped)', async ({ page }) => {
      const seen = await mockServer(page);
      await scene(page, { request: { url: 'https://mock.test/x?cv={{cv}}', preRequestScript: "pm.collectionVariables.set('cv','run-val'); pm.test('get', () => pm.expect(pm.collectionVariables.get('cv')).to.equal('run-val'));" } });
      await send(page);
      await expect(status(page)).toContainText('200');
      expect(seen.at(-1)!.url).toContain('cv=run-val');
    });
  });

});

import { test, expect } from './fixtures';
import { request as pwRequest, type Page, type APIRequestContext } from '@playwright/test';
import { API_URL } from './fixtures';
import { registerUser } from './helpers';

/**
 * Group 3 of MANUAL_TEST_PLAN_FAILED.md: E (auth tokens), F (scripts), G (environments), I (response viewer).
 * Each title starts with the plan id. Tests assert the CORRECT behaviour; test.fail() marks bugs still present.
 */

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

test.describe('E — auth tokens', () => {
  test('[E1.1] bearer token resolves {{token}} from the environment; an empty token sends no header', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { request: { auth: { type: 'bearer', bearer: { token: '{{tok}}' } } }, env: [v('tok', 'abc123')] });
    await send(page);
    await expect(status(page)).toContainText('200');
    expect(seen.at(-1)!.headers['authorization']).toBe('Bearer abc123');
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-bearer-token').fill('');
    await send(page);
    await expect.poll(() => seen.length).toBe(2);
    expect(seen.at(-1)!.headers['authorization']).toBeUndefined();
  });

  test('[E4.2] a custom bearer prefix is sent in the Authorization header', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { request: { auth: { type: 'bearer', bearer: { token: 'tk', prefix: 'Token' } } } });
    await send(page);
    await expect(status(page)).toContainText('200');
    expect(seen.at(-1)!.headers['authorization']).toBe('Token tk');
  });
});

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
  test('[G1.1] {{var}} from the selected environment resolves in URL, header, raw body and bearer auth', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, {
      env: [v('hostv', 'v-one')],
      request: {
        method: 'POST',
        url: 'https://mock.test/x?h={{hostv}}',
        headers: [{ key: 'X-H', value: '{{hostv}}', enabled: true }],
        body: { mode: 'raw', raw: 'b={{hostv}}', rawLanguage: 'text' },
        auth: { type: 'bearer', bearer: { token: '{{hostv}}' } },
      },
    });
    await send(page);
    await expect(status(page)).toContainText('200');
    const s = seen.at(-1)!;
    expect(s.url).toContain('h=v-one');
    expect(s.headers['x-h']).toBe('v-one');
    expect(s.body).toBe('b=v-one');
    expect(s.headers['authorization']).toBe('Bearer v-one');
  });

  test('[G1.5] the selected environment survives a page reload', async ({ page }) => {
    await mockServer(page);
    await scene(page, { env: [v('k', 'v')], request: {} });
    const chosen = await page.getByTestId('env-select').inputValue();
    expect(chosen).not.toBe('');
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await expect(page.getByTestId('env-select')).toHaveValue(chosen);
  });

  test('[G1.6] an unsaved edit in the environment editor is flagged and closing the tab asks first', async ({ page }) => {
    await mockServer(page);
    await scene(page, { env: [v('k', 'orig')], request: {} });
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-node-EnvA').click();
    await page.getByTestId('env-var-initial-0').fill('draft');
    await expect(page.getByTestId('dirty-indicator').first()).toBeVisible();
    const tab = page.locator('[data-testid^="tab-"]:not([role="tab"])', { hasText: 'EnvA' });
    await tab.hover();
    await tab.getByRole('button').last().click();
    await expect(page.getByText('Unsaved Changes').first()).toBeVisible();
  });

  test('[G3.3] copying an environment twice into the same workspace gives unique names', async () => {
    const { ctx } = await newUser('g33');
    const ws = (await (await ctx.post('/api/workspaces', { data: { name: uniq('ws') } })).json());
    const wsId = ws.id ?? ws._id;
    const env = await (await ctx.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'Src', variables: [] } })).json();
    const id = env.id ?? env._id;
    const a = await (await ctx.post(`/api/environments/${id}/duplicate`, { data: {} })).json();
    const b = await (await ctx.post(`/api/environments/${id}/duplicate`, { data: {} })).json();
    expect(a.name).not.toBe(b.name);
  });

  test('[G4.2] secret variable values are not returned to a read-only member', async () => {
    const owner = await newUser('g42o');
    const viewer = await newUser('g42v');
    const ws = (await (await owner.ctx.post('/api/workspaces', { data: { name: uniq('ws') } })).json());
    const wsId = ws.id ?? ws._id;
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewer.email, role: 'viewer' } })).ok()).toBeTruthy();
    await owner.ctx.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'S', variables: [v('sec', 'TOPSECRET', { isSecret: true, type: 'secret' })] } });
    const asViewer = await (await viewer.ctx.get(`/api/workspaces/${wsId}/environments`)).text();
    expect(asViewer).not.toContain('TOPSECRET');
    const asOwner = await (await owner.ctx.get(`/api/workspaces/${wsId}/environments`)).text();
    expect(asOwner).toContain('TOPSECRET');
  });

  test('[G5.2] pm.collectionVariables.set is usable by the same run (documented as run-scoped)', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { request: { url: 'https://mock.test/x?cv={{cv}}', preRequestScript: "pm.collectionVariables.set('cv','run-val'); pm.test('get', () => pm.expect(pm.collectionVariables.get('cv')).to.equal('run-val'));" } });
    await send(page);
    await expect(status(page)).toContainText('200');
    expect(seen.at(-1)!.url).toContain('cv=run-val');
  });

  test('[G8.3] a dynamic variable inside an environment value is resolved on send', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { env: [v('dyn', 'envguid-{{$guid}}')], request: { url: 'https://mock.test/x?u={{dyn}}' } });
    await send(page);
    await expect(status(page)).toContainText('200');
    const u = decodeURIComponent(seen.at(-1)!.url);
    expect(u).toMatch(/u=envguid-[0-9a-f-]{36}/);
  });
});

test.describe('I — response viewer', () => {
  test('[I1.4] a PDF is rendered/downloadable and a binary zip does not crash the viewer', async ({ page }) => {
    await mockServer(page, (u) => u.pathname === '/pdf'
      ? { contentType: 'application/pdf', body: Buffer.from('JVBERi0xLg==', 'base64') }
      : { contentType: 'application/zip', body: Buffer.from([0x50, 0x4b, 3, 4, 0, 255, 254, 0, 1, 2]) });
    await scene(page, { request: { url: 'https://mock.test/pdf' } });
    await send(page);
    await expect(page.locator('object[type="application/pdf"]')).toBeVisible();
    await page.getByTestId('request-url-input').fill('https://mock.test/zip');
    await send(page);
    await expect(status(page)).toContainText('200');
    const dl = page.waitForEvent('download');
    await page.getByTitle('Save Response').click();
    await dl;
  });

  test('[I3.4] Authorization is masked in the console drawer until "Show secrets" is pressed', async ({ page }) => {
    await mockServer(page);
    await scene(page, { request: { auth: { type: 'bearer', bearer: { token: 'SUPERSECRETTOKEN' } } } });
    await page.getByTestId('console-toggle-btn').click();
    await send(page);
    await expect(status(page)).toContainText('200');
    await page.getByTestId('console-log-request').first().click();
    const details = page.getByTestId('console-log-details');
    await expect(details).toBeVisible();
    await expect(details).not.toContainText('SUPERSECRETTOKEN');
    await page.getByTestId('console-reveal-btn').click();
    await expect(details).toContainText('SUPERSECRETTOKEN');
  });

  test('[I3.5] the console keeps at most 1000 entries', async ({ page }) => {
    await mockServer(page);
    await scene(page, { request: { preRequestScript: 'for (let i=0;i<1100;i++) console.log("line"+i);' } });
    await page.getByTestId('console-toggle-btn').click();
    await send(page);
    await expect(status(page)).toContainText('200');
    await expect(page.getByTestId('console-drawer')).toContainText('Console (1000)');
  });

  test('[I3.6] a URL with an unresolved {{variable}} is flagged in the console', async ({ page }) => {
    await mockServer(page);
    await scene(page, { request: { url: 'https://mock.test/x/{{nope_undefined}}' } });
    await page.getByTestId('console-toggle-btn').click();
    await send(page);
    await expect(page.getByTestId('console-unresolved-var').first()).toBeVisible();
  });

  test('[I4.2] connection refused (closed port) gives an explanatory message', async ({ page }) => {
    await scene(page, { request: { url: 'http://127.0.0.1:1/x' } });
    await send(page);
    await expect(status(page)).toContainText('Network Error');
    await expect(page.getByTestId('response-body-viewer')).toContainText('Could not reach http://127.0.0.1:1/x');
  });

  test('[I4.3] a CORS-blocked response explains the problem and suggests the extension', async ({ page }) => {
    // The dev API only allows the default client origin, so a cross-origin GET from this page is CORS-blocked for real.
    await scene(page, { request: { url: `${API_URL}/api/health` } });
    await send(page);
    await expect(status(page)).toContainText('Network Error');
    await expect(page.getByTestId('response-body-viewer')).toContainText(/extension/i);
  });

  test('[I4.6] Cancel aborts the request and reports "Canceled" (distinct from a timeout)', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    await page.route('https://slow.test/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      await gate;
      await route.fulfill({ status: 200, body: 'late', headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
    });
    await scene(page, { request: { url: 'https://slow.test/x' } });
    await send(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(status(page)).toContainText('Canceled');
    await expect(page.getByTestId('response-body-viewer')).not.toContainText(/timed out/i);
    release();
  });
});

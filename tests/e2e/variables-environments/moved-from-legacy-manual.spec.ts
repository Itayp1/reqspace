import { test, expect, API_URL } from '../fixtures';
import { type Page, request as pwRequest, type APIRequestContext } from '@playwright/test';
import http from 'http';
import { type AddressInfo } from 'net';
import { registerUser, apiAs, treeNode, openNodeMenu, selectWorkspace } from '../helpers';

test.describe('moved from legacy-manual (d)', () => {
  interface Seen { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }
  let server: http.Server;
  let PORT = 0;
  let seen: Seen[] = [];
  const base = () => `http://localhost:${PORT}`;
  const hitsOn = (prefix: string) => seen.filter((s) => s.url.startsWith(prefix));

  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const cors: Record<string, string> = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Allow-Headers': String(req.headers['access-control-request-headers'] || '*'),
        };
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
        const rec: Seen = { method: req.method || '', url: req.url || '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
        seen.push(rec);
        const m = /^\/status\/(\d+)/.exec(rec.url);
        res.writeHead(m ? Number(m[1]) : 200, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rec));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    PORT = (server.address() as AddressInfo).port;
  });
  test.afterAll(async () => { await new Promise((r) => server.close(r)); });
  test.beforeEach(() => { seen = []; });

  /** Fresh account, landed on a new empty request tab. */
  async function newRequestPage(page: Page, prefix = 'dfail') {
    const email = await registerUser(page, prefix);
    // Sending jar cookies is off by default; the cookie tests below need it on.
    await page.request.put('/api/auth/settings', { data: { sendCookies: true } });
    await page.reload();
    await page.getByTestId('create-request-btn').click();
    await expect(page.getByTestId('request-url-input')).toBeVisible();
    return email;
  }

  async function send(page: Page) {
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 15000 });
  }

  async function setUrl(page: Page, url: string) {
    await page.getByTestId('request-url-input').fill(url);
  }

  async function addHeader(page: Page, idx: number, key: string, value: string) {
    await page.getByTestId('req-tab-headers').click();
    await page.getByTestId(`kv-key-${idx}`).fill(key);
    await page.getByTestId(`kv-val-${idx}`).fill(value);
  }

  async function openConsole(page: Page) {
    if (!(await page.getByTestId('console-drawer').isVisible().catch(() => false))) {
      await page.getByTestId('console-toggle-btn').click();
    }
    await expect(page.getByTestId('console-drawer')).toBeVisible();
  }

  /** Text of the newest request log's expanded details in the Console (secrets revealed). */
  async function consoleRequestDetails(page: Page): Promise<string> {
    await openConsole(page);
    const reveal = page.getByTestId('console-reveal-btn');
    await page.getByTestId('console-log-request').first().click();
    let text = await page.getByTestId('console-log-details').first().innerText();
    if (text.includes('••••') && (await reveal.isVisible().catch(() => false))) {
      await reveal.click();
      text = await page.getByTestId('console-log-details').first().innerText();
    }
    return text;
  }

  async function personalWorkspaceId(page: Page): Promise<string> {
    const wss = await (await page.request.get('/api/workspaces')).json();
    const list = Array.isArray(wss) ? wss : wss.workspaces;
    const ws = list.find((w: any) => w.isPersonal) ?? list[0];
    return ws.id ?? ws._id;
  }

  async function createEnv(page: Page, name: string, vars: Record<string, string>) {
    const wsId = await personalWorkspaceId(page);
    const res = await page.request.post(`/api/workspaces/${wsId}/environments`, {
      data: { name, variables: Object.entries(vars).map(([key, v]) => ({ key, initialValue: v, currentValue: v, enabled: true, type: 'default' })) },
    });
    expect(res.ok(), 'create env').toBeTruthy();
    await page.reload();
    await page.getByTestId('env-select').selectOption({ label: name });
    await ensureRequestTab(page);
  }

  /** After a reload: make sure an empty request tab is open. */
  async function ensureRequestTab(page: Page) {
    const url = page.getByTestId('request-url-input');
    await page.waitForTimeout(1500);
    if (!(await url.isVisible().catch(() => false))) {
      const cr = page.getByTestId('create-request-btn');
      if (await cr.isVisible().catch(() => false)) await cr.click();
      else await page.getByTestId('new-tab-btn').click();
    }
    await expect(url).toBeVisible();
  }

  /** The settings PUT is rejected by the server (see [D-SETTINGS]), which rolls the toggle back; stub it so D-tests exercise their own feature. */
  async function stubSettingsSave(page: Page) {
    await page.route('**/api/auth/settings', (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) : route.continue());
  }

  async function openSettings(page: Page) {
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('global-settings-close-btn')).toBeVisible();
  }
  async function closeSettings(page: Page) {
    await page.getByTestId('global-settings-close-btn').click();
  }

  test.describe('D - requests and HTTP (UI, failed-manual-test regressions)', () => {
    // cookies
    async function openCookieManager(page: Page) {
      await page.locator('button[aria-label="Manage cookies"]').click();
      await expect(page.getByTestId('cookie-manager-modal')).toBeVisible();
    }
    async function addCookieRow(page: Page, fields: { name: string; value: string; path?: string; expires?: string; secure?: boolean }, rowIdx: number) {
      await page.getByTestId('cookie-add-btn').click();
      const row = page.getByTestId('cookie-row').nth(rowIdx);
      await row.getByTestId('cookie-name-input').fill(fields.name);
      await row.getByTestId('cookie-value-input').fill(fields.value);
      if (fields.path) await row.getByTestId('cookie-path-input').fill(fields.path);
      if (fields.expires) await row.getByTestId('cookie-expires-input').fill(fields.expires);
      if (fields.secure) await row.locator('input[type=checkbox]').nth(1).check();
    }

    // load test
    async function openLoadTest(page: Page) {
      await page.getByTestId('load-test-open-btn').click();
      await expect(page.getByTestId('load-test-modal')).toBeVisible();
    }

    test('[D1.11] {{ autocomplete: ArrowDown + Enter inserts the variable', async ({ page }) => {
      await newRequestPage(page);
      await createEnv(page, 'AutoEnv', { baseUrl: 'http://x', other: 'y' });
      const input = page.getByTestId('request-url-input');
      await input.click();
      await input.fill('');
      await input.pressSequentially('{{');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue(/^\{\{\w+\}\}$/);
    });
  });

});

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
    test('[I3.6] a URL with an unresolved {{variable}} is flagged in the console', async ({ page }) => {
      await mockServer(page);
      await scene(page, { request: { url: 'https://mock.test/x/{{nope_undefined}}' } });
      await page.getByTestId('console-toggle-btn').click();
      await send(page);
      await page.getByRole('button', { name: 'Run Anyway' }).click();
      await expect(page.getByTestId('console-unresolved-var').first()).toBeVisible();
    });
  });

});

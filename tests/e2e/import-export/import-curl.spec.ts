import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
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

test.describe('cURL import through the API and the URL bar (manual-test regressions)', () => {
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
});

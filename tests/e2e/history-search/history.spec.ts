import { test, expect, API_URL } from '../fixtures';
import { selectWorkspace, activeWorkspaceId, expectWorkspaceListed, registerUser, openNodeMenu } from '../helpers';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
test.describe("History Logging", () => {
  test.describe.configure({ mode: "serial" });
  const timestamp = Date.now();
  const testEmail = `history_${timestamp}@example.com`;
  const testPassword = "password123";
  let workspaceId = "";

  test.beforeAll(async ({ request }) => {
    // Fast API-based register, ahead of every test's UI login below.
    await request.post("/api/auth/register", {
      data: { name: "History User", email: testEmail, password: testPassword },
    });
  });

  test.beforeEach(async ({ page }) => {
    // Each test gets a fresh browser context — there's no session left over
    // from the previous test, so every test has to log in for itself.
    await page.goto("/login");
    await page.getByTestId("login-email").fill(testEmail);
    await page.getByTestId("login-password").fill(testPassword);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test("Request history is logged and replayable", async ({ page }) => {
    // Create Workspace (custom in-app modal, not a native dialog)
    const wsName = `Hist WS ${timestamp}`;
    await page.getByTestId("new-workspace-btn").click();
    await page.getByTestId("prompt-input").fill(wsName);
    await page.getByTestId("prompt-submit").click();
    await expectWorkspaceListed(page, wsName);
    workspaceId = await activeWorkspaceId(page);

    // Create a request and send
    await page.getByTestId("new-tab-btn").click();
    await page.getByTestId("request-url-input").fill("https://httpbin.org/get");
    await page.getByTestId("request-send-btn").click();
    // Real HTTP/2 responses (as httpbin.org serves) have no reason phrase.
    await expect(page.getByTestId("response-status")).toContainText("200", { timeout: 15000 });

    // Change URL and send again to verify state
    await page.getByTestId("request-url-input").fill("https://httpbin.org/status/201");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("201", { timeout: 15000 });

    // Open History sidebar
    await page.getByTestId("tab-history").click();

    // Verify first request is in history
    const historyItems = page.locator('[data-testid="history-item"]');
    await expect(historyItems.first()).toBeVisible();
    await expect(
      page.locator('[data-testid="history-item"]:has-text("httpbin.org/get")'),
    ).toBeVisible();

    // Click the history item to restore it
    await page.click(
      '[data-testid="history-item"]:has-text("httpbin.org/get")',
    );

    // Verify the URL input now has the restored URL
    await expect(page.getByTestId("request-url-input")).toHaveValue(
      "https://httpbin.org/get",
    );
  });

  test("Search history", async ({ page }) => {
    await selectWorkspace(page, workspaceId);
    await page.getByTestId("new-tab-btn").click();

    // Send a couple of requests
    await page.getByTestId("request-url-input").fill("https://httpbin.org/get?q=search1");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("200", { timeout: 15000 });

    await page.getByTestId("request-url-input").fill("https://httpbin.org/get?q=search2");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("200", { timeout: 15000 });

    // Open History sidebar
    await page.getByTestId("tab-history").click();

    // Search for search1
    await page.getByPlaceholder("Search history...").fill("search1");

    // Expect search1 to be visible
    await expect(
      page.locator('[data-testid="history-item"]:has-text("search1")'),
    ).toBeVisible();
    // Expect search2 to not be visible
    await expect(
      page.locator('[data-testid="history-item"]:has-text("search2")'),
    ).not.toBeVisible();
  });

  test("Save to Collection from History", async ({ page }) => {
    await selectWorkspace(page, workspaceId);

    // Ensure we have a collection (custom in-app modal, not a native dialog)
    const newBtn = page.getByTestId("new-collection-empty-btn");
    if (await newBtn.isVisible()) {
      await newBtn.click();
    } else {
      await page.getByTestId("new-collection-btn").click();
    }
    await page.getByTestId("prompt-input").fill("History Collection");
    await page.getByTestId("prompt-input").press("Enter");
    await expect(page.getByTestId("node-History Collection")).toBeVisible();

    // Open history
    await page.getByTestId("tab-history").click();

    // Clear search if any
    await page.getByPlaceholder("Search history...").fill("");

    // Hover and click Save on the first item
    const firstItem = page.locator('[data-testid="history-item"]').first();
    await firstItem.hover();
    await firstItem.locator('button[title="Save to Collection"]').click();

    await page.getByTestId("save-req-name-input").fill("Saved from History");
    const saveModal = page
      .getByTestId("save-req-name-input")
      .locator("xpath=ancestor::form");
    await saveModal.getByText("History Collection", { exact: true }).click();
    const saveSubmit = page.getByTestId("save-req-submit-btn");
    await expect(saveSubmit).toBeEnabled();
    await saveSubmit.click();

    // Verify it is saved in the collection sidebar. A fresh page load starts
    // every collection collapsed, so it has to be expanded first.
    await expect(page.getByTestId("save-req-name-input")).toBeHidden();
    await page.getByTestId("tab-collections").click();
    await expect(page.getByTestId("node-History Collection")).toBeVisible();
    // Save already opens the target collection. Clicking the row toggles it
    // shut, which hides the request that was just saved.
    await expect(page.getByTestId("node-Saved from History")).toBeVisible();
  });

  test("Quota behavior - large response bodies are truncated, not excluded", async ({ page }) => {
    // The server's history quota (server/src/routes/history.ts) truncates an
    // oversized response body to maxRequestBodyKB (default 10KB) and evicts
    // the OLDEST entries once the user's total exceeds maxTotalPerUserMB —
    // it never excludes the triggering request itself, so the history entry
    // for this URL is still expected to show up.
    await selectWorkspace(page, workspaceId);
    await page.getByTestId("new-tab-btn").click();

    // Send a request that returns > 500KB (e.g. 600000 bytes)
    await page.getByTestId("request-url-input").fill("https://httpbin.org/bytes/600000");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("200", {
      timeout: 15000,
    });

    // Open history
    await page.getByTestId("tab-history").click();

    await expect(
      page.locator('[data-testid="history-item"]:has-text("600000")'),
    ).toBeVisible();
  });
});


/**
 * QA-64/QA-40/QA-99: a history entry stored only the resolved URL, so restoring it (or "Save to
 * Collection" from history) persisted `http://host/...` instead of `{{baseUrl}}/...`.
 * QA-68: the restored tab was named by the URL.
 */
test('history restore keeps {{baseUrl}} and names the tab after the request', async ({ page }) => {
  await registerUser(page, 'hist_raw');
  await page.route('http://qa-host.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));

  const ws = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
  const col = await (await page.request.post(`/api/workspaces/${ws}/collections`, {
    data: { name: 'Raw Col', variables: [{ key: 'baseUrl', value: 'http://qa-host.example.test', enabled: true }] },
  })).json();
  await page.request.post(`/api/collections/${col._id}/requests`, {
    data: { name: 'List Users', method: 'GET', url: '{{baseUrl}}/users' },
  });
  await page.reload();

  await page.getByTestId('node-Raw Col').click();
  await page.getByTestId('node-List Users').click();
  const saved = page.waitForResponse((r) => /\/history$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByTestId('request-send-btn').click();
  await saved;

  await page.getByTestId('tab-history').click();
  await page.getByTestId('history-item').first().click();

  await expect(page.getByTestId('request-url-input')).toHaveValue('{{baseUrl}}/users');
  await expect(page.locator('[data-testid^="tab-"]').filter({ hasText: 'List Users' }).last()).toBeVisible();
  await expect(page.locator('[data-testid^="tab-"]').filter({ hasText: 'qa-host.example.test' })).toHaveCount(0);
});


test('history Save/Delete buttons become visible when keyboard focus lands in the row', async ({ page }) => {
  await registerUser(page, 'hist_kbd');
  await page.route('https://hist.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('request-url-input').fill('https://hist.example.test/kbd');
  const saved = page.waitForResponse(r => /\/history$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByTestId('request-send-btn').click();
  await saved;
  await page.getByTestId('tab-history').click();
  const del = page.getByTestId('history-item').first().getByTitle('Delete');
  await expect(del).toHaveCSS('opacity', '0');
  await del.focus();
  await expect(del).toHaveCSS('opacity', '1');
});

test.describe('History recording and storage', () => {
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

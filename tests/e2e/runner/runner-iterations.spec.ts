import { test, expect } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL } from '../fixtures';
import { startNewRequest, registerUser, createCollectionUi, addViaMenu, treeNode, openNodeMenu } from '../helpers';

test.describe('Collection Runner', () => {
  test('Each runner iteration substitutes its data-file row into the request', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner_json_' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');
    await page.waitForSelector('[data-testid="workspace-select"]');

    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) { await newBtn.click(); }
    else { await page.getByTestId('new-collection-btn').click(); }
    await page.getByTestId('prompt-input').fill('Test Collection Runner JSON');
    await page.getByTestId('prompt-input').press('Enter');
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Runner JSON') });
    await expect(colNode).toBeVisible();

    // Create the request (custom in-app modal, not a native dialog), then
    // open it to set its URL — the "New Request" prompt only asks for a name.
    await colNode.hover();
    await startNewRequest(page, colNode);
    await page.getByTestId('prompt-input').fill('Echo Request');
    await page.getByTestId('prompt-input').press('Enter');
    await page.getByTestId('node-Echo Request').click();
    await page.getByTestId('request-url-input').fill('http://runner-test.local/echo?val={{var}}');
    await page.getByTestId('request-save-btn').click();

    const interceptedVals: string[] = [];
    await page.route('http://runner-test.local/echo*', async route => {
      const url = new URL(route.request().url());
      interceptedVals.push(url.searchParams.get('val') || '');
      await route.fulfill({ status: 200, body: 'ok' });
    });

    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toBeVisible();

    const iterInput = page.locator('input[type="number"]').nth(1);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'data.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ "var": "apple" }, { "var": "banana" }, { "var": "cherry" }]))
    });

    await expect(iterInput).toHaveValue('3');
    await page.getByTestId('collection-runner-run-btn').click();

    await expect.poll(() => interceptedVals.length).toBe(3);
    expect(interceptedVals).toEqual(['apple', 'banana', 'cherry']);
  });

  test('CSV data file drives iterations identically to JSON', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner_csv_' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');
    await page.waitForSelector('[data-testid="workspace-select"]');

    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) { await newBtn.click(); }
    else { await page.getByTestId('new-collection-btn').click(); }
    await page.getByTestId('prompt-input').fill('Test Collection Runner CSV');
    await page.getByTestId('prompt-input').press('Enter');
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Runner CSV') });
    await expect(colNode).toBeVisible();

    await colNode.hover();
    await startNewRequest(page, colNode);
    await page.getByTestId('prompt-input').fill('Echo Request');
    await page.getByTestId('prompt-input').press('Enter');
    await page.getByTestId('node-Echo Request').click();
    await page.getByTestId('request-url-input').fill('http://runner-test.local/echo?val={{var}}');
    await page.getByTestId('request-save-btn').click();

    const interceptedVals: string[] = [];
    await page.route('http://runner-test.local/echo*', async route => {
      const url = new URL(route.request().url());
      interceptedVals.push(url.searchParams.get('val') || '');
      await route.fulfill({ status: 200, body: 'ok' });
    });

    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toBeVisible();

    const iterInput = page.locator('input[type="number"]').nth(1);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('var\ndog\ncat\nbird')
    });

    await expect(iterInput).toHaveValue('3');
    await page.getByTestId('collection-runner-run-btn').click();

    await expect.poll(() => interceptedVals.length).toBe(3);
    expect(interceptedVals).toEqual(['dog', 'cat', 'bird']);
  });

  test('Stop mid-run actually halts remaining iterations', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner_stop_' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');
    await page.waitForSelector('[data-testid="workspace-select"]');

    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) { await newBtn.click(); }
    else { await page.getByTestId('new-collection-btn').click(); }
    await page.getByTestId('prompt-input').fill('Test Collection Runner Stop');
    await page.getByTestId('prompt-input').press('Enter');
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Runner Stop') });
    await expect(colNode).toBeVisible();

    await colNode.hover();
    await startNewRequest(page, colNode);
    await page.getByTestId('prompt-input').fill('Slow Request');
    await page.getByTestId('prompt-input').press('Enter');
    await page.getByTestId('node-Slow Request').click();
    await page.getByTestId('request-url-input').fill('http://runner-test.local/slow');
    await page.getByTestId('request-save-btn').click();

    let callCount = 0;
    await page.route('http://runner-test.local/slow', async route => {
      callCount++;
      await new Promise(r => setTimeout(r, 1000));
      await route.fulfill({ status: 200, body: 'ok' });
    });

    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toBeVisible();

    const iterInput = page.locator('input[type="number"]').nth(1);
    await iterInput.fill('5');
    await page.getByTestId('collection-runner-run-btn').click();

    const stopBtn = page.getByTestId('collection-runner-stop-btn');
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();

    await page.waitForTimeout(2000);
    expect(callCount).toBeLessThan(5);
  });
});


/**
 * Finding 93: the Runner's iteration data (CSV/JSON row) is documented to
 * override every other variable scope, but a profile variable of the same
 * name used to win over it.
 */
const ts = Date.now();
const ip = () => `10.${200 + Math.floor(Math.random() * 40)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function newUser() {
  const ctx: APIRequestContext = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  const res = await ctx.post('/api/auth/register', { data: { name: 'Iter User', email: `iter_${ts}@example.com`, password: 'password123' } });
  expect(res.status(), 'register').toBe(201);
  const wsList = await (await ctx.get('/api/workspaces')).json();
  const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
  return { ctx, wsId: (ws.id ?? ws._id) as string };
}

async function loginWithCookies(page: Page, ctx: APIRequestContext) {
  await page.context().addCookies((await ctx.storageState()).cookies);
  // The server's CSRF check only accepts the Origin of the client port.
  await page.context().route('**/api/**', async (r) => {
    if (r.request().method() === 'GET') return r.fallback();
    try { const res = await r.fetch({ headers: { ...r.request().headers(), origin: new URL(page.url()).origin } }); await r.fulfill({ response: res }); } catch { /* page closed */ }
  });
  await page.goto('/');
  await expect(page.getByTestId('workspace-select')).toBeVisible();
}

test('iteration data wins over a profile variable of the same name', async ({ page }) => {
  const { ctx, wsId } = await newUser();
  const profile = await ctx.put('/api/user-profile-variables', { data: { variables: [{ key: 'name', value: 'from-profile', enabled: true }] } });
  expect(profile.ok(), await profile.text()).toBeTruthy();

  const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'IterCol' } })).json();
  const reqRes = await ctx.post(`/api/collections/${col.id ?? col._id}/requests`, {
    data: { method: 'GET', name: 'A', url: 'http://runner-test.local/echo?n={{name}}' },
  });
  expect(reqRes.ok(), await reqRes.text()).toBeTruthy();

  const seen: string[] = [];
  await page.route('http://runner-test.local/*', async (r) => {
    seen.push(new URL(r.request().url()).search);
    await r.fulfill({ status: 200, body: 'ok' });
  });

  await loginWithCookies(page, ctx);
  await openNodeMenu(page, 'IterCol');
  await page.getByTestId('action-menu-run-collection').click();
  await expect(page.getByTestId('collection-runner-modal')).toBeVisible();
  await page.getByTestId('collection-runner-data-file').setInputFiles({
    name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from('name\nfrom-csv\n'),
  });
  await page.getByTestId('collection-runner-run-btn').click();

  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0]).toBe('?n=from-csv');
});

test('runner asks to create variables that have no record, then runs; a second run does not ask', async ({ page }) => {
  await registerUser(page, 'mvr');
  await page.route('https://mv.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await createCollectionUi(page, 'MV Col');
  await addViaMenu(page, 'MV Col', 'new-request', 'One');
  await treeNode(page, 'One').click();
  await page.getByTestId('request-url-input').fill('https://mv.example.test/{{segment}}');
  await page.getByTestId('request-save-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);

  await openNodeMenu(page, 'MV Col');
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-run-btn').click();

  const dialog = page.getByTestId('missing-variables-modal');
  await expect(dialog).toContainText('segment');
  await page.getByTestId('missing-var-value-segment').fill('abc');
  await page.getByTestId('missing-variables-create').click();
  await expect(dialog).toHaveCount(0);
  const runner = page.getByTestId('collection-runner-modal');
  await expect(runner).toContainText('Passed1');

  // The variable now exists, so the next run starts straight away.
  await page.getByTestId('collection-runner-run-btn').click();
  await expect(runner).toContainText('Passed1');
  await expect(dialog).toHaveCount(0);
});

/**
 * The runner wrote each result into the *next* row (stale loop index), so the
 * last request never got a result and its row stayed "Pending".
 */
test.describe('Runner, empty URL, code snippets', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'rcu');
    await page.route('https://rcu.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  });

  test('every runner row gets its own result, and a request with no URL fails instead of passing', async ({ page }) => {
    await createCollectionUi(page, 'Run Col');
    for (const n of ['One', 'Two', 'Three']) await addViaMenu(page, 'Run Col', 'new-request', n);
    for (const n of ['One', 'Two']) {
      await treeNode(page, n).click();
      await page.getByTestId('request-url-input').fill(`https://rcu.example.test/${n}`);
      await page.getByTestId('request-save-btn').click();
      await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
    }
    await openNodeMenu(page, 'Run Col');
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toContainText('3 requests in collection');
    await page.getByTestId('collection-runner-run-btn').click();
    const modal = page.getByTestId('collection-runner-modal');
    await expect(modal).toContainText('3 / 3');
    await expect(modal).toContainText('Passed2');
    await expect(modal).toContainText('Failed1');
    await expect(modal.getByText('Pending')).toHaveCount(0);
  });
});

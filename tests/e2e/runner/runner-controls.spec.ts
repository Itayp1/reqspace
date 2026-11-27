import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { openNodeMenu } from '../helpers';
import fs from 'fs';

test.describe('runner controls: iterations, data files, stop, export', () => {
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

  /** Login rate limit (15/15min per IP) makes UI logins unusable here: reuse the API session cookie instead. */
  const sessions = new Map<string, any[]>();
  async function loginUi(page: Page, email: string) {
    const u = userByEmail.get(email)!;
    if (!sessions.has(email)) sessions.set(email, (await u.ctx.storageState()).cookies);
    await page.context().addCookies(sessions.get(email)!);
    // The server's CSRF check only accepts the Origin of the client port.
    await page.context().route('**/api/**', async (r) => {
      if (r.request().method() === 'GET') return r.fallback();
      // The page may close mid-flight; an unhandled rejection here fails the whole run outside any test.
      try { const res = await r.fetch({ headers: { ...r.request().headers(), origin: new URL(page.url()).origin } }); await r.fulfill({ response: res }); } catch { /* page closed */ }
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

});

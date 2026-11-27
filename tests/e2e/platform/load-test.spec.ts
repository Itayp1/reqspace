import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';
import http from 'http';
import { type AddressInfo } from 'net';
import { registerUser } from '../helpers';

/**
 * The Load Tester had no coverage. It isn't a perf benchmark — what matters
 * is that it fires exactly the requested number of requests, tallies
 * successes against failures, and that Stop really stops.
 */
test.describe('Load Tester', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Load User');
    await page.getByTestId('register-email').fill(`load_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    await page.getByTestId('create-request-btn').click();
  });

  test('runs exactly the configured number of iterations', async ({ page }) => {
    let hits = 0;
    await page.route('https://load.example.com/**', (route) => {
      hits++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://load.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    const modal = page.getByTestId('load-test-modal');
    await expect(modal).toBeVisible();

    await expect(page.getByTestId('load-test-iterations')).toHaveValue('10');
    await expect(page.getByTestId('load-test-concurrency')).toHaveValue('1');
    await page.getByTestId('load-test-iterations').fill('5');
    await page.getByTestId('load-test-start-btn').click();

    await expect(page.getByTestId('load-test-success')).toHaveText('5', { timeout: 20000 });
    await expect(page.getByTestId('load-test-failed')).toHaveText('0');
    // The run is over, so the button is back to Start, not Stop.
    await expect(page.getByTestId('load-test-start-btn')).toBeVisible();
    expect(hits).toBe(5);
  });

  test('failures are counted separately from successes', async ({ page }) => {
    // Every other call is rejected outright, so the tally has to split.
    let n = 0;
    await page.route('https://flaky.example.com/**', (route) => {
      n++;
      return n % 2 === 0 ? route.abort('failed')
        : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://flaky.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    await page.getByTestId('load-test-iterations').fill('4');
    await page.getByTestId('load-test-start-btn').click();

    await expect(page.getByTestId('load-test-success')).toHaveText('2', { timeout: 20000 });
    await expect(page.getByTestId('load-test-failed')).toHaveText('2');
  });

  test('concurrency runs the workers in parallel, still totalling the iterations', async ({ page }) => {
    let inFlight = 0;
    let maxInFlight = 0;
    await page.route('https://parallel.example.com/**', async (route) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 150));
      inFlight--;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://parallel.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    await page.getByTestId('load-test-iterations').fill('6');
    await page.getByTestId('load-test-concurrency').fill('3');
    await page.getByTestId('load-test-start-btn').click();

    await expect(page.getByTestId('load-test-success')).toHaveText('6', { timeout: 30000 });
    expect(maxInFlight).toBeGreaterThan(1);
  });

  test('Stop halts a run in progress', async ({ page }) => {
    let hits = 0;
    await page.route('https://stoppable.example.com/**', async (route) => {
      hits++;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://stoppable.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    await page.getByTestId('load-test-iterations').fill('50');
    await page.getByTestId('load-test-start-btn').click();

    // Stop appears only while running.
    const stop = page.getByTestId('load-test-stop-btn');
    await expect(stop).toBeVisible();
    await expect(page.getByTestId('load-test-success')).not.toHaveText('0');
    await stop.click();
    await expect(page.getByTestId('load-test-start-btn')).toBeVisible();

    // Nothing new goes out after the stop — 50 iterations at 200ms each would
    // take ten seconds, so a quiet second here means it really halted.
    const afterStop = hits;
    await page.waitForTimeout(1000);
    expect(hits).toBeLessThanOrEqual(afterStop + 1);
    expect(hits).toBeLessThan(50);
  });
});

test.describe('Load Test report and request resolution', () => {
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
  async function setUrl(page: Page, url: string) {
    await page.getByTestId('request-url-input').fill(url);
  }

  async function addHeader(page: Page, idx: number, key: string, value: string) {
    await page.getByTestId('req-tab-headers').click();
    await page.getByTestId(`kv-key-${idx}`).fill(key);
    await page.getByTestId(`kv-val-${idx}`).fill(value);
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
    // load test
    async function openLoadTest(page: Page) {
      await page.getByTestId('load-test-open-btn').click();
      await expect(page.getByTestId('load-test-modal')).toBeVisible();
    }

    test('[D13.1] the Load Test report shows p95 and requests/second', async ({ page }) => {
      await newRequestPage(page);
      await setUrl(page, `${base()}/lt`);
      await openLoadTest(page);
      await page.getByTestId('load-test-iterations').fill('5');
      await page.getByTestId('load-test-start-btn').click();
      await expect(page.getByTestId('load-test-success')).toHaveText('5', { timeout: 20000 });
      await expect(page.getByTestId('load-test-p95')).toContainText(/p95: \d+/);
      await expect(page.getByTestId('load-test-rps')).toContainText(/RPS: [1-9]/);
    });

    test('[D13.3] invalid iterations/concurrency values are rejected with a message and nothing is sent', async ({ page }) => {
      await newRequestPage(page);
      await setUrl(page, `${base()}/ltinvalid`);
      await openLoadTest(page);
      for (const bad of ['0', '-3', '', '1000000']) {
        await page.getByTestId('load-test-iterations').fill(bad);
        await page.getByTestId('load-test-start-btn').click();
        await expect(page.getByTestId('load-test-error'), `iterations=${bad}`).toBeVisible();
      }
      await page.getByTestId('load-test-iterations').fill('5');
      await page.getByTestId('load-test-concurrency').fill('0');
      await page.getByTestId('load-test-start-btn').click();
      await expect(page.getByTestId('load-test-error')).toBeVisible();
      await page.waitForTimeout(300);
      expect(hitsOn('/ltinvalid').length).toBe(0);
    });

    test('[D13.4] 5xx responses count as Failed, not Success', async ({ page }) => {
      await newRequestPage(page);
      await setUrl(page, `${base()}/status/500`);
      await openLoadTest(page);
      await page.getByTestId('load-test-iterations').fill('4');
      await page.getByTestId('load-test-start-btn').click();
      await expect(page.getByTestId('load-test-failed')).toHaveText('4', { timeout: 20000 });
      await expect(page.getByTestId('load-test-success')).toHaveText('0');
    });

    test('[D13.6] Load Test resolves {{$guid}}, environment variables and auth headers per iteration', async ({ page }) => {
      await newRequestPage(page);
      await createEnv(page, 'LtEnv', { token: 'env-token-1' });
      await setUrl(page, `${base()}/ltvars`);
      await addHeader(page, 0, 'X-Id', '{{$guid}}');
      await addHeader(page, 1, 'X-Tok', '{{token}}');
      await page.getByTestId('req-tab-authorization').click();
      await page.getByTestId('auth-type-select').selectOption('bearer');
      await page.getByTestId('auth-bearer-token').fill('{{token}}');
      await openLoadTest(page);
      await page.getByTestId('load-test-iterations').fill('3');
      await page.getByTestId('load-test-start-btn').click();
      await expect(page.getByTestId('load-test-success')).toHaveText('3', { timeout: 20000 });
      const hits = hitsOn('/ltvars');
      expect(hits.length).toBe(3);
      const ids = hits.map((h) => String(h.headers['x-id']));
      expect(ids.every((i) => i && !i.includes('{{'))).toBe(true);
      expect(new Set(ids).size).toBe(3);
      expect(hits.every((h) => h.headers['x-tok'] === 'env-token-1')).toBe(true);
      expect(hits.every((h) => h.headers.authorization === 'Bearer env-token-1')).toBe(true);
    });
});

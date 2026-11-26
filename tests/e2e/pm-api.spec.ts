import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from './fixtures';
import { scene } from './reproductions/scene';

/**
 * Postman pm.request / pm.response parity (docs/specs/pm-request-response-api.md).
 * One script (fixtures/pm-api-all.js) runs as pre-request and as test script; every member is one pm.test().
 * The transport is stubbed through window.electron because a browser fetch() hides Set-Cookie.
 */
const script = readFileSync(join(__dirname, 'fixtures', 'pm-api-all.js'), 'utf8');
const countTests = (s: string) => (s.match(/(?:^|[^.\w])t\('|pm\.test\('/gm) || []).length;
const bothCount = countTests(script.split('//#BOTH')[1].split('//#PRE')[0]);
const preCount = countTests(script.split('//#PRE')[1].split('//#POST')[0]);
const postCount = countTests(script.split('//#POST')[1]);

async function stubTransport(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__sent = [];
    w.electron = {
      sendRequest: async (payload: any) => {
        w.__sent.push(payload);
        return {
          status: 200, statusText: 'OK', isBase64: false, responseTime: 12, size: 60,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-custom': 'custom-val',
            'set-cookie': ['sid=abc; Path=/; HttpOnly; Domain=mock.test; Expires=Wed, 01 Jan 2031 00:00:00 GMT', 'theme=dark; Path=/p; Secure'],
          },
          body: '{"id":7,"name":"widget","tags":["a","b"],"nested":{"ok":true}}',
        };
      },
      abortRequest: () => {},
    };
  });
}

const base = {
  method: 'POST',
  url: 'https://mock.test/api/v1/items?a=1&b=2',
  headers: [
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'X-Keep', value: 'keep', enabled: true },
    { key: 'X-Remove', value: 'gone', enabled: true },
    { key: 'X-Update', value: 'old', enabled: true },
  ],
  body: { mode: 'raw', raw: '{"hello":"world"}', rawLanguage: 'json' },
  auth: { type: 'bearer', bearer: { token: 'tok' } },
};

async function sendAndRead(page: Page) {
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 15000 });
  await page.getByTestId('response-tab-test_results').click();
  await expect(page.getByTestId('test-result-item').first()).toBeVisible();
  const items = page.getByTestId('test-result-item');
  const out: Array<{ name: string; status: string; text: string }> = [];
  for (const it of await items.all()) {
    out.push({ name: (await it.getByTestId('test-result-name').textContent()) || '', status: (await it.getByTestId('test-result-status').textContent()) || '', text: (await it.textContent()) || '' });
  }
  return out;
}

test('pm.request / pm.response: every member of the API works in both phases', async ({ page }) => {
  await stubTransport(page);
  await scene(page, { ...base, preRequestScript: script, testScript: script });

  const results = await sendAndRead(page);
  const failed = results.filter((r) => r.status !== 'PASS');
  expect(failed.map((r) => `${r.name} | ${r.text}`), 'failing members').toEqual([]);
  expect(results.length, 'tests that ran').toBe(bothCount * 2 + preCount + postCount);
  expect(results.filter((r) => r.name.startsWith('pre: ')).length).toBe(bothCount + preCount);
  expect(results.filter((r) => r.name.startsWith('post: ')).length).toBe(bothCount + postCount);

  // What the pre-request script did must be on the wire.
  const sent = await page.evaluate(() => (window as any).__sent);
  expect(sent).toHaveLength(1);
  const h = Object.fromEntries(Object.entries(sent[0].headers).map(([k, v]) => [k.toLowerCase(), v]));
  expect(sent[0].method).toBe('PUT');
  const url = new URL(sent[0].url);
  expect(url.origin + url.pathname).toBe('https://mock.test/api/v1/items');
  expect([...url.searchParams.entries()]).toEqual([['a', '1'], ['c', '3'], ['d', '4'], ['e', '5']]);
  expect(sent[0].body).toBe('{"hello":"edited"}');
  expect(h).toMatchObject({ 'x-pre-done': '1', 'x-added': '1', 'x-str': 's', 'x-update': 'new', 'x-upserted': 'new', 'x-idx': 'idx', 'x-keep': 'keep' });
  expect(h).not.toHaveProperty('x-remove');
  expect(h).not.toHaveProperty('x-post'); // post-response mutations are ignored
});

test('pm.response negative control: a wrong assertion shows FAIL', async ({ page }) => {
  await stubTransport(page);
  await scene(page, { ...base, testScript: "pm.test('wrong status', () => pm.response.to.have.status(404)); pm.test('right status', () => pm.response.to.be.ok);" });
  const results = await sendAndRead(page);
  expect(results.map((r) => [r.name, r.status])).toEqual([['wrong status', 'FAIL'], ['right status', 'PASS']]);
  expect(results[0].text).toContain('404');
});

test('Collection Runner applies pre-request changes (addHeader, method, url) like Send', async ({ page }) => {
  await stubTransport(page);
  await scene(page, {
    ...base, method: 'GET', body: { mode: 'none' },
    preRequestScript: "pm.request.addHeader({ key: 'X-Run-Added', value: '1' }); pm.request.removeHeader('X-Remove'); pm.request.method = 'PUT'; pm.request.url.addQueryParams('r=1');",
  });
  const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Col') });
  await col.hover();
  await col.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  await expect(page.getByTestId('collection-runner-modal')).toBeVisible();
  await page.getByTestId('collection-runner-run-btn').click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent.length)).toBe(1);
  const sent = (await page.evaluate(() => (window as any).__sent))[0];
  const h = Object.fromEntries(Object.entries(sent.headers).map(([k, v]) => [k.toLowerCase(), v]));
  expect(sent.method).toBe('PUT');
  expect(sent.url).toContain('r=1');
  expect(h).toMatchObject({ 'x-run-added': '1', 'x-keep': 'keep' });
  expect(h).not.toHaveProperty('x-remove');
});

test('Collection Runner applies pre-request body and header-value changes', async ({ page }) => {
  await stubTransport(page);
  await scene(page, {
    ...base,
    preRequestScript: "pm.request.headers.upsert({ key: 'X-Update', value: 'new' }); pm.request.body.raw = '{\"changed\":true}';",
  });
  const col = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Col') });
  await col.hover();
  await col.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-run-btn').click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent.length)).toBe(1);
  const sent = (await page.evaluate(() => (window as any).__sent))[0];
  const h = Object.fromEntries(Object.entries(sent.headers).map(([k, v]) => [k.toLowerCase(), v]));
  expect(h['x-update']).toBe('new');
  expect(sent.body).toBe('{"changed":true}');
});

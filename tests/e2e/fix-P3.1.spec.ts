import { test, expect } from './fixtures';
import { createServer, request as httpRequest, type IncomingMessage } from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { registerUser } from './helpers';

/**
 * P3.1 (finding 69): a valid proxy URL (http://127.0.0.1:8080) must make requests
 * go through the proxy.
 *
 * What the app does (verified by reading the code, there is no bug):
 *  - Web build (BrowserTransport): a browser page cannot choose a proxy, so the
 *    request is sent directly and the app says so (console warn + info toast).
 *  - Extension build: UrlBar passes `localProxy` (getLocalProxyConfig) in the
 *    transport payload; extension/background.js applies it with chrome.proxy
 *    for the duration of the request (bypassList '<-loopback>' so 127.0.0.1 is proxied).
 *  - Desktop (Electron) receives the same `localProxy` field.
 * The server-side proxy relay was removed (c53b2e2).
 *
 * Verifiable here in plain Chromium:
 *  1. with a fake extension content script, the transport payload carries the saved
 *     proxy (and omits it when the proxy is disabled);
 *  2. extension/background.js, run in a vm with a stub `chrome`, turns that payload
 *     into a chrome.proxy fixed_servers rule pointing at our stub proxy, and a stub
 *     proxy receiving an absolute-URI request proves the rule is routable;
 *  3. without the extension the web build warns that the proxy is not used.
 * NOT automatable here: the real browser actually tunnelling traffic through
 * chrome.proxy (needs the loaded extension in a headed Chromium, or the Electron app).
 */

const FAKE_EXTENSION = () => {
  (window as any).__sent = [];
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'reqspace-client') return;
    if (e.data.type === 'REQSPACE_PING') {
      window.postMessage({ source: 'reqspace-extension', type: 'REQSPACE_PONG', version: 'test' }, '*');
    } else if (e.data.type === 'REQSPACE_SEND') {
      (window as any).__sent.push(e.data.payload);
      window.postMessage({ source: 'reqspace-extension', type: 'REQSPACE_RESPONSE', id: e.data.id,
        response: { status: 200, statusText: 'OK', headers: { 'content-type': 'text/plain' }, body: 'via-ext', time: 1, size: 7 } }, '*');
    }
  });
};

async function setProxy(page: any, on: boolean, url = 'http://127.0.0.1:8080') {
  await page.getByTestId('settings-btn').click();
  const cb = page.getByTestId('proxy-enable-checkbox');
  if (on) {
    await cb.check();
    await page.getByTestId('proxy-url-input').fill(url);
  } else {
    await cb.uncheck();
  }
  await page.reload(); // settings persist; also closes the modal
}

async function sendOnce(page: any, url: string) {
  // First send needs a request tab; later sends reuse the restored tab.
  await page.getByTestId('create-request-btn').click({ timeout: 4000 }).catch(() => {});
  await page.getByTestId('request-url-input').fill(url);
  await page.getByTestId('request-send-btn').click();
}

test('[P3.1] a configured proxy is passed to the transport (and omitted when off); stub proxy receives routed traffic', async ({ page }) => {
  // Stub HTTP proxy: sees absolute-URI requests.
  const seen: string[] = [];
  const proxy = createServer((req: IncomingMessage, res) => {
    seen.push(req.url || '');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('proxied');
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()));
  const proxyPort = (proxy.address() as any).port;
  const proxyUrl = `http://127.0.0.1:${proxyPort}`;

  try {
    await page.addInitScript(FAKE_EXTENSION);
    await registerUser(page, 'p31');

    await setProxy(page, true, proxyUrl);
    await sendOnce(page, 'http://example.test/hello');
    await expect(page.getByTestId('response-status')).toContainText('200');
    const sent = await page.evaluate(() => (window as any).__sent);
    expect(sent).toHaveLength(1);
    expect(sent[0].localProxy).toMatchObject({ url: proxyUrl });

    // Extension side: background.js builds the chrome.proxy rule from that payload.
    const setCalls: any[] = [];
    const chromeStub: any = {
      runtime: { onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({}) } },
      declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async () => {} },
      webRequest: { onHeadersReceived: { addListener() {} } },
      proxy: { settings: { get: async () => ({ levelOfControl: 'controllable_by_this_extension', value: { mode: 'system' } }), set: async (a: any) => { setCalls.push(a); }, clear: async () => {} } },
    };
    const ctx: any = vm.createContext({ chrome: chromeStub, URL, console, Promise });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8'), ctx);
    expect(await ctx.acquireProxy(sent[0].localProxy)).toBe(true);
    const rule = setCalls[0].value;
    expect(rule.mode).toBe('fixed_servers');
    expect(rule.rules.singleProxy).toMatchObject({ scheme: 'http', host: '127.0.0.1', port: proxyPort });
    expect(rule.rules.bypassList).toContain('<-loopback>');

    // The rule's host/port is a working proxy: an absolute-URI request through it is observed.
    const body = await new Promise<string>((resolve, reject) => {
      const r = httpRequest({ host: '127.0.0.1', port: proxyPort, path: 'http://example.test/hello', headers: { host: 'example.test' } }, (res) => {
        let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
      });
      r.on('error', reject); r.end();
    });
    expect(body).toBe('proxied');
    expect(seen).toContain('http://example.test/hello');

    // Proxy disabled: nothing is passed to the transport.
    await setProxy(page, false);
    await sendOnce(page, 'http://example.test/direct');
    await expect(page.getByTestId('response-status')).toContainText('200');
    const sent2 = await page.evaluate(() => (window as any).__sent);
    expect(sent2[sent2.length - 1].localProxy).toBeUndefined();
  } finally {
    proxy.close();
  }
});

test('[P3.1] in the plain web build (no extension) the app warns the proxy is not used', async ({ page }) => {
  await registerUser(page, 'p31w');
  await setProxy(page, true);
  await page.route('http://example.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: 'direct' }));
  await sendOnce(page, 'http://example.test/x');
  await expect(page.getByTestId('toast-info').filter({ hasText: /proxy/i }).first()).toBeVisible();
});

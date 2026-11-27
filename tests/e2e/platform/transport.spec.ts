import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';
import http, { type Server } from 'http';
import { type AddressInfo } from 'net';
import { createServer, request as httpRequest, type IncomingMessage } from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { registerUser } from '../helpers';

test.describe('proxy transport', () => {
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

  async function setProxy(page: any, on: boolean, url = 'http://127.0.0.1:8080', verifySsl = false) {
    await page.getByTestId('settings-btn').click();
    if (verifySsl) await page.locator('#verifySsl').check();
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
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'extension', 'background.js'), 'utf8'), ctx);
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
    // Verify SSL is off by default and its warning comes first (only warnings[0] is toasted); turn it on so the proxy warning is the one shown.
    await setProxy(page, true, undefined, true);
    await page.route('http://example.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: 'direct' }));
    await sendOnce(page, 'http://example.test/x');
    await expect(page.getByTestId('toast-info').filter({ hasText: /proxy/i }).first()).toBeVisible();
  });
});

test.describe('electron bridge', () => {
  // Guards the dual-target setup: in the electron project the page must be the real desktop
  // window (preload bridge present); in the browser projects it must not be.
  // The desktop bridge is present only when the electron project runs with the real transport.
  test.use({ desktopTransport: 'real' } as any);

  test('the test page is the target it claims to be', async ({ page }) => {
    await page.goto('/login');
    const hasBridge = await page.evaluate(() => typeof (window as any).electron?.sendRequest === 'function');
    expect(hasBridge).toBe(process.env.REQSPACE_TARGET === 'electron');
  });
});

test.describe('browser transport warnings', () => {
  interface Seen { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }
  let server: http.Server;
  let PORT = 0;
  let seen: Seen[] = [];
  const base = () => `http://localhost:${PORT}`;


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
  async function openConsole(page: Page) {
    if (!(await page.getByTestId('console-drawer').isVisible().catch(() => false))) {
      await page.getByTestId('console-toggle-btn').click();
    }
    await expect(page.getByTestId('console-drawer')).toBeVisible();
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

    test('[D4.8] with Verify SSL off the browser transport warns that it cannot skip certificate checks', async ({ page }) => {
      await newRequestPage(page);
      await stubSettingsSave(page);
      await openSettings(page);
      await page.locator('#verifySsl').uncheck();
      await closeSettings(page);
      await setUrl(page, `${base()}/ssl`);
      await send(page);
      await openConsole(page);
      await expect(page.getByTestId('console-log-warn').filter({ hasText: /Verify SSL/i }).first()).toBeVisible();
    });

    test('[D4.9] a configured local proxy is flagged as unsupported by the browser transport', async ({ page }) => {
      await newRequestPage(page);
      await stubSettingsSave(page);
      await openSettings(page);
      await page.getByTestId('proxy-enable-checkbox').check();
      await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:54321');
      await expect(page.getByTestId('proxy-browser-warning')).toBeVisible();
      await closeSettings(page);
      await setUrl(page, `${base()}/proxy`);
      await send(page);
      await openConsole(page);
      await expect(page.getByTestId('console-log-warn').filter({ hasText: /proxy/i }).first()).toBeVisible();
    });
});

test.describe('proxy settings and mTLS', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });


  const listen = (srv: Server) => new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as any).port)));
  const CERT_PEM = "-----BEGIN CERTIFICATE-----\r\nMIIBhzCCAS2gAwIBAgIUSC01PKBBLEzZ4okJFaSgUTfq454wCgYIKoZIzj0EAwIw\r\nGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDAgFw0yNjEwMTYwOTM4NTBaGA8yMTI2\r\nMDkyMjA5Mzg1MFowGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDBZMBMGByqGSM49\r\nAgEGCCqGSM49AwEHA0IABKTR0pLsVVpt/H4g2XcyGnYR4CKehPYxaTxALWy32T15\r\nQN2AGDqLgMknFCgGu1Z6Hvp5YQtlz6ZUYow90cP910CjUzBRMB0GA1UdDgQWBBRa\r\nFZjWtRBOs5BKsYxKZZZQhFcYsTAfBgNVHSMEGDAWgBRaFZjWtRBOs5BKsYxKZZZQ\r\nhFcYsTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQC8VVrIpLt0\r\nG1bGJQSqK8SoqGJqrjYyLhhqX+8/drKmqQIgETNqoXOhtRdIH8ec/vv9o4hIC5bg\r\nzPI4mEPRkPc4dw8=\r\n-----END CERTIFICATE-----";
  const KEY_PEM = "-----BEGIN PRIVATE KEY-----\r\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnrQB7AqhdPqXamWJ\r\nv+LJM+oqmHIRWaB7Iylu9LrMLkChRANCAASk0dKS7FVabfx+INl3Mhp2EeAinoT2\r\nMWk8QC1st9k9eUDdgBg6i4DJJxQoBrtWeh76eWELZc+mVGKMPdHD/ddA\r\n-----END PRIVATE KEY-----";

  test.describe('P — search, settings, certs, theme', () => {
    // A plain browser cannot route a request through a proxy, so this runs against the desktop
    // transport (electron/httpRequest.js): REQSPACE_TARGET=electron npx playwright test -g P3.1
    test.describe('[P3.1] desktop transport @electron', () => {
    test.use({ desktopTransport: 'real' } as any);
    test('[P3.1] requests go through the configured local proxy (and directly when off)', async ({ page }) => {
      const proxied: string[] = [];
      const direct: string[] = [];
      const proxy: Server = createServer((req, res) => { proxied.push(req.url || ''); res.end('via-proxy'); });
      const origin: Server = createServer((req, res) => { direct.push(req.url || ''); res.end('direct'); });
      await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
      await new Promise<void>((r) => origin.listen(0, '127.0.0.1', r));
      const proxyPort = (proxy.address() as any).port;
      const originPort = (origin.address() as any).port;
      try {
        await registerUser(page, 'p31');
        await page.getByTestId('settings-btn').click();
        await page.getByTestId('proxy-enable-checkbox').check();
        await page.getByTestId('proxy-url-input').fill(`http://127.0.0.1:${proxyPort}`);
        await page.getByTestId('proxy-noproxy-input').fill('');
        await page.getByTestId('global-settings-close-btn').click();

        await page.getByTestId('new-tab-btn').click();
        // An unresolvable host: it can only be answered by the proxy.
        await page.getByTestId('request-url-input').fill('http://proxied-host.invalid/p31');
        await page.getByTestId('request-send-btn').click();
        await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 15000 });
        expect(proxied.some((u) => u.includes('proxied-host.invalid/p31'))).toBe(true);

        await page.getByTestId('settings-btn').click();
        await page.getByTestId('proxy-enable-checkbox').uncheck();
        await page.getByTestId('global-settings-close-btn').click();

        const before = proxied.length;
        await page.getByTestId('request-url-input').fill(`http://127.0.0.1:${originPort}/p31-direct`);
        await page.getByTestId('request-send-btn').click();
        await expect.poll(() => direct.length, { timeout: 15000 }).toBeGreaterThan(0);
        expect(direct[0]).toBe('/p31-direct');
        expect(proxied.length).toBe(before);
      } finally {
        proxy.close();
        origin.close();
      }
    });
    });

    test('[P3.2] an invalid proxy URL (abc / empty) shows an inline error; a valid URL does not', async ({ page }) => {
      await registerUser(page, 'p32');
      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').check();
      await page.getByTestId('proxy-url-input').fill('abc');
      await expect(page.getByTestId('proxy-url-error')).toBeVisible();
      await page.getByTestId('proxy-url-input').fill('');
      await expect(page.getByTestId('proxy-url-error')).toBeVisible();
      await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:8080');
      await expect(page.getByTestId('proxy-url-error')).toBeHidden();
      await page.getByTestId('proxy-auth-checkbox').check();
      await expect(page.getByTestId('proxy-username-input')).toBeVisible();
      await expect(page.getByTestId('proxy-password-input')).toBeVisible();
    });

    test('[P3.3] No-proxy field exists and a plain browser warns that the proxy is not applied', async ({ page }) => {
      await registerUser(page, 'p33');
      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').check();
      await expect(page.getByTestId('proxy-noproxy-input')).toBeVisible();
      await page.getByTestId('proxy-noproxy-input').fill('localhost, *.internal');
      await expect(page.getByTestId('proxy-browser-warning')).toBeVisible();
    });

    test('[P3.4] the proxy password is a password field and never stored in localStorage', async ({ page }) => {
      await registerUser(page, 'p34');
      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').check();
      await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:8080');
      await page.getByTestId('proxy-auth-checkbox').check();
      await page.getByTestId('proxy-password-input').fill('S3cretProxyPw');
      await expect(page.getByTestId('proxy-password-input')).toHaveAttribute('type', 'password');
      await page.waitForTimeout(500);
      const dump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
      expect(dump).not.toContain('S3cretProxyPw');
    });

    test('[P4.2] mTLS: sending to a server that demands a client cert succeeds with it and fails without', async () => {
      // Electron-only transport (electron/httpRequest.js); exercised directly in Node against a real mTLS server.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { sendRequest } = require(path.join(__dirname, '..', '..', '..', 'electron', 'httpRequest.js'));
      const https = await import('https');
      const srv = https.createServer({ key: KEY_PEM, cert: CERT_PEM, ca: [CERT_PEM], requestCert: true, rejectUnauthorized: true }, (_q, r) => { r.end('mtls-ok'); });
      const port = await listen(srv as unknown as Server);
      try {
        const url = `https://127.0.0.1:${port}/`;
        const ok = await sendRequest({ method: 'GET', url, verifySsl: false, clientCertificates: [{ hostname: '127.0.0.1', cert: CERT_PEM, key: KEY_PEM }] });
        expect(ok.body).toBe('mtls-ok');
        await expect(sendRequest({ method: 'GET', url, verifySsl: false, clientCertificates: [] })).rejects.toThrow();
      } finally { srv.close(); }
    });

    test('[P4.3] mTLS hostname matching: mismatch not attached; wildcard matches subdomains only', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { hostnameMatches, findClientCertificate } = require(path.join(__dirname, '..', '..', '..', 'electron', 'httpRequest.js'));
      expect(hostnameMatches('*.example.com', 'a.example.com')).toBe(true);
      expect(hostnameMatches('*.example.com', 'a.b.example.com')).toBe(true);
      expect(hostnameMatches('*.example.com', 'example.com')).toBe(false);
      expect(hostnameMatches('api.example.com', 'other.example.com')).toBe(false);
      expect(findClientCertificate([{ hostname: 'api.example.com' }], 'other.example.com')).toBeUndefined();
    });
  });
});

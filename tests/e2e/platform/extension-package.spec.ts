import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import { registerUser } from '../helpers';
import fs from 'fs';
import path from 'path';

test.describe('extension download', () => {
  test.describe('R2.5 extension download', () => {
    test('[R2.5] /extension/reqspace-transport.zip is served as a valid zip containing manifest.json', async () => {
      const ctx = await pwRequest.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { 'X-Forwarded-For': `10.${230 + Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` },
      });
      const res = await ctx.get('/extension/reqspace-transport.zip');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toMatch(/zip/);
      const buf = await res.body();
      expect(buf.subarray(0, 4).toString('hex')).toBe('504b0304'); // PK\x03\x04
      expect(buf.includes(Buffer.from('manifest.json'))).toBeTruthy();
    });
  });

  test.describe('extension crx download', () => {
    test('/extension/reqspace-transport.crx is a CRX3 wrapping the extension zip', async () => {
      const ctx = await pwRequest.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { 'X-Forwarded-For': `10.${230 + Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` },
      });
      const res = await ctx.get('/extension/reqspace-transport.crx');
      expect(res.status()).toBe(200);
      const buf = await res.body();
      expect(buf.subarray(0, 4).toString('latin1')).toBe('Cr24');
      expect(buf.readUInt32LE(4)).toBe(3);
      const zipStart = 12 + buf.readUInt32LE(8);
      expect(buf.subarray(zipStart, zipStart + 4).toString('hex')).toBe('504b0304');
      expect(buf.includes(Buffer.from('manifest.json'))).toBeTruthy();
    });
  });

  test.describe('extension crx zip download', () => {
    test('/extension/reqspace-transport-crx.zip is a zip holding the .crx', async () => {
      const ctx = await pwRequest.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { 'X-Forwarded-For': `10.${230 + Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` },
      });
      const res = await ctx.get('/extension/reqspace-transport-crx.zip');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toMatch(/zip/);
      const buf = await res.body();
      expect(buf.subarray(0, 4).toString('hex')).toBe('504b0304');
      expect(buf.includes(Buffer.from('reqspace-transport.crx'))).toBeTruthy();
    });
  });
});

test.describe('Get App download', () => {
  test('Get app button is hidden inside the desktop app', async ({ page }) => {
    await page.addInitScript(() => { (window as any).electron = {}; });
    await registerUser(page, 'get_app_el');
    await expect(page.getByTestId('env-select')).toBeVisible();
    await expect(page.getByTestId('get-app-btn')).toHaveCount(0);
  });

  test('Get app button opens the download modal with desktop and extension links; Escape closes', async ({ page }) => {
    await registerUser(page, 'get_app');
    await page.getByTestId('get-app-btn').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Download Extension \(\.zip\)/ })).toHaveAttribute('href', /reqspace-transport\.zip$/);
    await expect(dialog.getByRole('link', { name: /\.crx in a \.zip/ })).toHaveAttribute('href', /reqspace-transport-crx\.zip$/);
    await expect(dialog.getByRole('link', { name: /Desktop app \(Windows\)/ })).toHaveAttribute('href', /reqSpace-Setup\.exe$/);
    await expect(dialog.getByRole('link', { name: /standalone/ })).toHaveAttribute('href', /reqSpace-Portable\.exe$/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('browser extension source checks', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  test('[S2.3] options.js validates origins (scheme, wildcard, spaces, path)', async () => {
    const js = src('extension/options.js');
    const fn = new Function(`${js.slice(js.indexOf('function validateOrigin'), js.indexOf('async function addOrigin'))}; return validateOrigin;`)();
    expect(fn('https://example.com')).toBe('');
    expect(fn('http://localhost:3000')).toBe('');
    for (const bad of ['example.com', 'https://example.com/path', 'https://exa mple.com', '*', 'https://*.example.com', 'ftp://x.com']) {
      expect(fn(bad), bad).not.toBe('');
    }
    expect(js).toMatch(/includes\(origin\)/);
  });

  test('[S2.6] content.js stays silent (no PONG, no bridge) on origins outside the allowlist', async () => {
    const js = src('extension/content.js');
    expect(js).toContain('originAllowlist.includes(window.location.origin)');
    const handler = js.slice(js.indexOf("addEventListener('message'"));
    expect(handler.indexOf('isAllowed()')).toBeGreaterThan(-1);
    expect(handler.indexOf('isAllowed()')).toBeLessThan(handler.indexOf('REQSPACE_PING'));
    expect(js.slice(js.indexOf('Announce presence'))).toMatch(/isAllowed/);
  });

  test('[S3.3] DNR rules match the exact URL via an escaped regexFilter, unique ids, removed afterwards', async () => {
    const js = src('extension/background.js');
    expect(js).toContain('regexFilter');
    expect(js).not.toMatch(/^\s*urlFilter:/m);
    expect(js).toContain('nextRuleId++');
    expect(js).toContain('removeRuleIds: [ruleId]');
    const esc = new Function(`${js.slice(js.indexOf('function escapeRegex'), js.indexOf('function isBinaryType'))}; return escapeRegex;`)();
    const url = 'https://a.com/p?x=1&y=*|^#z';
    expect(new RegExp('^' + esc(url) + '$').test(url)).toBe(true);
    expect(new RegExp('^' + esc(url) + '$').test('https://a.com/p?x=1&y=other')).toBe(false);
  });

  test('[S3.5] binary responses are returned base64-encoded and decoded by the client', async () => {
    const bg = src('extension/background.js');
    expect(bg).toContain('isBase64');
    expect(bg).toContain('toBase64(buf)');
    expect(src('client/src/transport/extension.ts')).toMatch(/isBase64/);
  });

  test('[S3.6] Set-Cookie is captured via webRequest and bodies are read as ArrayBuffer', async () => {
    // 50MB / 60s / self-signed-cert behaviour needs a real Chrome with the extension loaded: only the code path is asserted.
    expect(JSON.parse(src('extension/manifest.json')).permissions).toContain('webRequest');
    const bg = src('extension/background.js');
    expect(bg).toMatch(/set-cookie/);
    expect(bg).toContain('arrayBuffer()');
  });

  test('[S3.8] Cancel is wired end to end: client -> content script -> background AbortController', async () => {
    expect(src('client/src/transport/extension.ts')).toContain('REQSPACE_CANCEL');
    expect(src('extension/content.js')).toContain('CANCEL_REQUEST');
    const bg = src('extension/background.js');
    expect(bg).toContain("'CANCEL_REQUEST'");
    expect(bg).toContain('controller.abort');
    expect(bg).toContain('signal: controller.signal');
  });
});

test.describe('extension install prompt', () => {
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('[P6.1] first visit without the extension prompts, and the Download link serves a real zip', async ({ page }) => {
    await registerUser(page, 'p61');
    const prompt = page.getByTestId('extension-install-prompt');
    await expect(prompt).toBeVisible({ timeout: 10000 });
    const res = await (await pwRequest.newContext()).get(`${API_URL}/extension/reqspace-transport.zip`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/zip/);
    expect((await res.body()).subarray(0, 2).toString()).toBe('PK');
  });
});

import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import { registerUser } from '../helpers';

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

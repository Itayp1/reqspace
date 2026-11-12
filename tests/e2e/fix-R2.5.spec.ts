import { test, expect } from './fixtures';
import { request as pwRequest } from '@playwright/test';
import { API_URL } from './fixtures';

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

import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import crypto from 'crypto';

test.describe('Client certificates (API)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;

  const CERT_PEM = "-----BEGIN CERTIFICATE-----\r\nMIIBhzCCAS2gAwIBAgIUSC01PKBBLEzZ4okJFaSgUTfq454wCgYIKoZIzj0EAwIw\r\nGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDAgFw0yNjEwMTYwOTM4NTBaGA8yMTI2\r\nMDkyMjA5Mzg1MFowGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDBZMBMGByqGSM49\r\nAgEGCCqGSM49AwEHA0IABKTR0pLsVVpt/H4g2XcyGnYR4CKehPYxaTxALWy32T15\r\nQN2AGDqLgMknFCgGu1Z6Hvp5YQtlz6ZUYow90cP910CjUzBRMB0GA1UdDgQWBBRa\r\nFZjWtRBOs5BKsYxKZZZQhFcYsTAfBgNVHSMEGDAWgBRaFZjWtRBOs5BKsYxKZZZQ\r\nhFcYsTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQC8VVrIpLt0\r\nG1bGJQSqK8SoqGJqrjYyLhhqX+8/drKmqQIgETNqoXOhtRdIH8ec/vv9o4hIC5bg\r\nzPI4mEPRkPc4dw8=\r\n-----END CERTIFICATE-----";
  const KEY_PEM = "-----BEGIN PRIVATE KEY-----\r\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnrQB7AqhdPqXamWJ\r\nv+LJM+oqmHIRWaB7Iylu9LrMLkChRANCAASk0dKS7FVabfx+INl3Mhp2EeAinoT2\r\nMWk8QC1st9k9eUDdgBg6i4DJJxQoBrtWeh76eWELZc+mVGKMPdHD/ddA\r\n-----END PRIVATE KEY-----";

  async function newUserCtx(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.${180 + (seq % 40)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` } });
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } });
    expect(res.status()).toBe(201);
    return { ctx, email };
  }





  test('[P4.4] invalid certificate files are rejected with a clear 400 message', async () => {
    const { ctx } = await newUserCtx('p44');
    const post = (data: object) => ctx.post('/api/auth/certificates', { data: { hostname: 'h.test', ...data } });
    let r = await post({ cert: 'just some text', key: 'more text' });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/certificate/i);
    r = await post({ cert: KEY_PEM, key: KEY_PEM });
    expect(r.status()).toBe(400);
    const enc = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'right' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    r = await post({ cert: CERT_PEM, key: enc.privateKey });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/passphrase/i);
    r = await post({ cert: CERT_PEM, key: enc.privateKey, passphrase: 'wrong' });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/passphrase/i);
    r = await post({ cert: CERT_PEM, key: enc.privateKey, passphrase: 'right' });
    expect(r.status()).toBe(400); // valid key, but does not match the certificate
    expect((await r.json()).message).toMatch(/match/i);
  });

  test('[P4.8] a second certificate for the same hostname (any case) replaces the first', async () => {
    const { ctx } = await newUserCtx('p48');
    expect((await ctx.post('/api/auth/certificates', { data: { hostname: 'Dup.Example.com', cert: CERT_PEM, key: KEY_PEM } })).status()).toBe(201);
    const r = await ctx.post('/api/auth/certificates', { data: { hostname: 'dup.example.com', cert: CERT_PEM, key: KEY_PEM } });
    expect(r.status()).toBe(201);
    expect((await r.json())).toHaveLength(1);
  });
});

import { test, expect } from './fixtures';
import { apiAsAdmin } from './helpers';

test.describe('Q9.2 SMTP Test Connection SSRF guard', () => {
  test('[Q9.2] SMTP Test Connection refuses private targets when allowPrivateTargets is off', async () => {
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    const original = !!before.proxy?.allowPrivateTargets;
    try {
      if (original) {
        const r = await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: false } } });
        expect(r.ok()).toBeTruthy();
      }
      const started = Date.now();
      const res = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 25 } });
      expect(res.status()).toBe(400);
      expect((await res.json()).message).toMatch(/private|blocked|internal/i);
      // Must be rejected up front, not after a network timeout.
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      if (original) {
        await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } });
      }
    }
  });
});

import { test, expect } from './fixtures';
import net from 'net';
import type { AddressInfo } from 'net';
import { apiAsAdmin } from './helpers';

test.describe('Q8.6 allowPrivateTargets switch (SMTP test; the server no longer fetches URLs for users)', () => {
  test('[Q8.6] SMTP Test Connection to a private address is blocked when off and reaches the host when on', async () => {
    // Minimal SMTP responder: greets, answers EHLO, accepts QUIT.
    let hits = 0;
    const CRLF = String.fromCharCode(13, 10);
    const smtp = net.createServer((sock) => {
      hits++;
      sock.write('220 q86.test ESMTP' + CRLF);
      sock.on('data', (d) => {
        const line = d.toString().toUpperCase();
        if (line.startsWith('EHLO') || line.startsWith('HELO')) sock.write('250 q86.test' + CRLF);
        else if (line.startsWith('QUIT')) sock.end('221 bye' + CRLF);
        else sock.write('250 OK' + CRLF);
      });
    });
    await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));
    const port = (smtp.address() as AddressInfo).port;
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    const original = !!before.proxy?.allowPrivateTargets;
    try {
      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: false } } })).ok()).toBeTruthy();
      const blocked = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port } });
      expect(blocked.status()).toBe(400);
      expect((await blocked.json()).message).toMatch(/private|internal|blocked/i);
      expect(hits).toBe(0);

      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } })).ok()).toBeTruthy();
      // Wait out the 1s duplicate-check cooldown is unnecessary: the guard key includes the policy.
      const allowed = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port } });
      const body = await allowed.json();
      expect(allowed.status()).toBe(200);
      expect(body.message).toContain(`127.0.0.1:${port}`);
      expect(hits).toBeGreaterThan(0);
    } finally {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: original } } });
      smtp.close();
    }
  });
});

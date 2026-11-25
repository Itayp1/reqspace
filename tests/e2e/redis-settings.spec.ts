import { test, expect } from './fixtures';
import net from 'net';
import type { AddressInfo } from 'net';
import { apiAsAdmin } from './helpers';

// Minimal RESP responder: answers every command (AUTH, INFO, PING...) with +OK.
async function fakeRedis() {
  const srv = net.createServer((sock) => {
    sock.on('data', (d) => {
      const cmds = d.toString().split('\r\n').filter((l) => l.startsWith('*')).length;
      sock.write('+OK\r\n'.repeat(cmds));
    });
    sock.on('error', () => {});
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, port: (srv.address() as AddressInfo).port };
}

const settings = (port: number, extra = {}) => ({ host: '127.0.0.1', port, username: '', password: 'secret-pw', tls: false, db: 0, ...extra });

test.describe('Redis socket adapter settings', () => {
  test('test-connection and save accept a reachable Redis, reject an unreachable one, and mask the password', async () => {
    const admin = await apiAsAdmin();
    const { srv, port } = await fakeRedis();
    const dead = net.createServer();
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', r));
    const deadPort = (dead.address() as AddressInfo).port;
    await new Promise<void>((r) => dead.close(() => r()));
    try {
      expect((await admin.post('/api/admin/test-redis', { data: settings(port) })).status()).toBe(200);
      const bad = await admin.post('/api/admin/test-redis', { data: settings(deadPort) });
      expect(bad.status()).toBe(400);
      expect((await bad.json()).message).toMatch(/Redis connection failed/);

      // An unreachable Redis is not saved.
      const rejected = await admin.put('/api/admin/config', { data: { server: { redis: { enabled: true, ...settings(deadPort) } } } });
      expect(rejected.status()).toBe(400);
      expect((await (await admin.get('/api/admin/config')).json()).server.redis.enabled).toBe(false);

      // A reachable one is saved; the password never comes back, and echoing the mask keeps it.
      expect((await admin.put('/api/admin/config', { data: { server: { redis: { enabled: true, ...settings(port) } } } })).ok()).toBeTruthy();
      const saved = (await (await admin.get('/api/admin/config')).json()).server.redis;
      expect(saved).toMatchObject({ enabled: true, host: '127.0.0.1', port });
      expect(saved.password).not.toBe('secret-pw');
      expect((await admin.post('/api/admin/test-redis', { data: settings(port, { password: saved.password }) })).status()).toBe(200);
    } finally {
      await admin.put('/api/admin/config', { data: { server: { redis: { enabled: false } } } });
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
});

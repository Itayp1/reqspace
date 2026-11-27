import { test, expect, API_URL, fetchFpErrorsSince } from '../fixtures';
import net, { type AddressInfo } from 'net';
import { apiAsAdmin } from '../helpers';

test.describe('CORS loopback origin', () => {
  // QA-24 / QA-23: the dev client opened via 127.0.0.1 (same port as the Vite client) got
  // "Cross-origin request blocked"; the built-in dev origin list only knew localhost:5173.
  test('the dev client port is allowed on both localhost and 127.0.0.1 without extra settings', async ({ request }) => {
    const port = process.env.CLIENT_PORT || '5173';
    for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`]) {
      const res = await request.get(`${API_URL}/api/auth/config`, { headers: { Origin: origin } });
      expect(res.headers()['access-control-allow-origin'], origin).toBe(origin);
    }
  });

  test('any localhost or 127.0.0.1 port passes the state-changing origin check, a foreign origin does not', async ({ request }) => {
    // A wrong-credentials login reaches the route (401) only if the Origin check let it through; a blocked one answers 403.
    const login = (origin: string) => request.post(`${API_URL}/api/auth/login`, { headers: { Origin: origin }, data: { email: 'nobody', password: 'wrong-password' } });
    for (const origin of ['http://localhost:61234', 'http://127.0.0.1:61234']) {
      expect((await login(origin)).status(), origin).not.toBe(403);
    }
    expect((await login('http://evil.example')).status()).toBe(403);
    expect((await login('https://localhost:61234')).status(), 'only plain http loopback').toBe(403);
  });

  test('an unrelated origin is still refused', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/auth/config`, { headers: { Origin: 'http://evil.example' } });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });
});

test.describe('API performance', () => {
  const uuidv4 = () => require('crypto').randomUUID();

  test.describe('Performance Tests', () => {
    const perfLimit = parseInt(process.env.PERF_TIMEOUT || '100', 10);

    test(`API endpoints should respond in under ${perfLimit}ms`, async ({ request }) => {
      // 1. Create a user to get auth token (using API bypass to measure raw speed)
      const email = `perf${uuidv4()}@example.com`;
      const pass = 'password123';
      
      const regStart = Date.now();
      const regRes = await request.post('/api/auth/register', {
        data: { name: 'Perf User', email, password: pass }
      });
      const regTime = Date.now() - regStart;
      
      // Registration involves bcrypt hashing, which is intentionally slow (cost factor).
      // We log it, but don't strictly assert <100ms because bcrypt *should* take longer.
      console.log(`Registration took ${regTime}ms`);

      const loginRes = await request.post('/api/auth/login', {
        data: { email, password: pass }
      });
      const { token } = await loginRes.json();

      // 2. Measure a fast data fetch (e.g. Workspaces)
      const wsStart = Date.now();
      const wsRes = await request.get('/api/workspaces');
      const wsTime = Date.now() - wsStart;
      console.log(`Fetch Workspaces took ${wsTime}ms`);
      
      // Assert that the raw database/API read is under the performance limit!
      expect(wsTime).toBeLessThan(perfLimit);
    });
  });
});

test.describe('Redis settings', () => {
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
});

test.describe('App shell', () => {
  test.describe('database outage', () => {
    // The client reports the 503 from /api/health like any other failed API
    // call. The test asserts that report and then deletes it, so the table is
    // empty again; the allowance only matters if it fails before the cleanup.
    test.use({ allowFpErrors: ['/api/health'] });

  test('a database outage shows the database-error screen instead of a broken app', async ({ page, fpErrorsApi }) => {
    const since = new Date();
    await page.route('**/api/health', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', dbType: 'sqlite', dbError: 'SQLITE_CANTOPEN: unable to open database file' }),
    }));
    await page.goto('/');
    await expect(page.getByText('Database Connection Error')).toBeVisible();
    await expect(page.getByText('SQLITE_CANTOPEN: unable to open database file')).toBeVisible();
    await page.getByText('How to fix this').click();
    await expect(page.getByText('Common fixes:')).toBeVisible();

    // The failed health check reached fperrors (the client reporting path
    // works), and is cleared so the run leaves the table empty.
    let fingerprint = '';
    await expect.poll(async () => {
      const group = (await fetchFpErrorsSince(fpErrorsApi, since)).find(g => g.kind === 'api' && g.route === '/api/health');
      fingerprint = group?.fingerprint ?? '';
      return group?.message ?? '';
    }).toContain('503');
    expect((await fpErrorsApi.delete(`/api/admin/errors/${fingerprint}`)).ok()).toBeTruthy();
  });
  });
});

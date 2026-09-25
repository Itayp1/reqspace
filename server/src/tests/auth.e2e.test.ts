// Using native Node fetch
export {};
const BASE_URL = 'http://localhost:3005';

describe('E2E Auth - Registration and Login', () => {
  let email = '';
  const password = 'password123';

  beforeAll(async () => {
    // Wait for health
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.status === 200) {
          healthy = true;
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!healthy) throw new Error('Server not healthy');

    // Self-registration now defaults to closed (CR#24). Enable it as the admin
    // would, so the registration flow below can run. On a fresh server the
    // seeded superadmin is admin/admin.
    const adminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin', password: 'admin' }),
    });
    const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] || '';
    await fetch(`${BASE_URL}/api/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ auth: { allowSelfRegistration: true } }),
    });
  }, 35000);

  it('should register a new user and ensure they are not superadmin (SEC-13)', async () => {
    email = `test-${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email, password })
    });

    const regData = await regRes.json() as any;
    expect(regRes.status).toBe(201);
    expect(regData.user.email).toBe(email);
    expect(regData.user.isSuperAdmin).toBe(false);

    // Verify in database via an admin route or /me with the cookie
    const cookie = regRes.headers.get('set-cookie')?.split(';')[0] || '';
    
    // Assert 403 from an admin-only route
    const adminRes = await fetch(`${BASE_URL}/api/admin/config`, {
      method: 'GET',
      headers: { cookie }
    });
    expect(adminRes.status).toBe(403);
  });

  it('should login the new user', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const loginData = await loginRes.json() as any;
    expect(loginRes.status).toBe(200);
    expect(loginData.user.email).toBe(email);
    // Session lives in the httpOnly cookie, not in the response body (a JWT
    // in the JSON body would be readable by any XSS on the page, defeating
    // the point of httpOnly) — assert the cookie instead of a body token.
    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/token=.+HttpOnly/i);
  });

  it('should not login with wrong password', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong' })
    });

    expect(loginRes.status).toBe(401);
  });

  it('should not leak client certificates (SEC-8)', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (loginRes.status !== 200) throw new Error(await loginRes.text());
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';

    const certPayload = {
      hostname: 'test.example.com',
      cert: '-----BEGIN CERTIFICATE-----\nMIIB...test...cert\n-----END CERTIFICATE-----',
      key: '-----BEGIN PRIVATE KEY-----\nMIIE...test...key\n-----END PRIVATE KEY-----',
      passphrase: 'supersecretpassphrase123!'
    };
    const postRes = await fetch(`${BASE_URL}/api/auth/certificates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(certPayload)
    });
    expect(postRes.status).toBe(201);
    
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { cookie }
    });
    const meData = await meRes.json() as any;
    expect(meRes.status).toBe(200);
    const certs = meData.clientCertificates;
    expect(certs.length).toBe(1);
    expect(certs[0].hostname).toBe('test.example.com');
    expect(certs[0].cert).toBeUndefined();
    expect(certs[0].key).toBeUndefined();
    expect(certs[0].passphrase).toBeUndefined();
    
    const responseText = JSON.stringify(meData);
    expect(responseText).not.toContain('BEGIN PRIVATE KEY');
    expect(responseText).not.toContain('supersecretpassphrase123!');
  });
});

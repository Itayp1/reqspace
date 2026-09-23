// Using native Node fetch
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
  }, 35000);

  it('should register a new user', async () => {
    email = `test-${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email, password })
    });

    const regData = await regRes.json() as any;
    expect(regRes.status).toBe(201);
    expect(regData.user.email).toBe(email);
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
});

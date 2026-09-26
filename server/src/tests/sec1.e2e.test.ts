import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'http://127.0.0.1:3005';

describe('SEC-1: Self-registered users are not superadmins', () => {
  let cookie: string;
  const testEmail = `bob.${uuidv4()}@example.com`;

  beforeAll(async () => {
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.status === 200) { healthy = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!healthy) throw new Error('Server not healthy');
  }, 35000);

  it('should register a user with isSuperAdmin=false and verify they cannot access admin routes', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Outsider',
        email: testEmail,
        password: 'Password123!'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.user.isSuperAdmin).toBe(false);

    cookie = res.headers.get('set-cookie')?.split(';')[0] || '';
    
    const adminRes = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { 'Cookie': cookie }
    });
    
    expect(adminRes.status).toBe(403);
  });
});

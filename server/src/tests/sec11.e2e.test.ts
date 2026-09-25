export {};
const BASE_URL = 'http://localhost:3005';

describe('SEC-11: OAuth state / CSRF', () => {
  it('GET /api/auth/state should set oauth_state cookie and return state', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/state`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(typeof data.state).toBe('string');
    expect(data.state).toHaveLength(64);

    const cookies = res.headers.get('set-cookie') || '';
    expect(cookies).toContain('oauth_state=');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=Lax');
  });

  it('POST /api/auth/google should reject missing state', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'dummycode', redirectUri: 'http://localhost:5173/auth/google/callback' })
    });
    expect(res.status).toBe(400); // Because state is required by Zod schema
  });

  it('POST /api/auth/google should reject invalid state', async () => {
    // Generate valid payload but no cookie
    const res = await fetch(`${BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'dummycode', redirectUri: 'http://localhost:5173/auth/google/callback', state: '0'.repeat(64) })
    });
    // Will fail OAuth state validation
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.message).toBe('Invalid or expired OAuth state');
  });
});

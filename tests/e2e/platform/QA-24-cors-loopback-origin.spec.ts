import { test, expect, API_URL } from '../fixtures';

// QA-24 / QA-23: the dev client opened via 127.0.0.1 (same port as the Vite client) got
// "Cross-origin request blocked"; the built-in dev origin list only knew localhost:5173.
test('the dev client port is allowed on both localhost and 127.0.0.1 without extra settings', async ({ request }) => {
  const port = process.env.CLIENT_PORT || '5173';
  for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`]) {
    const res = await request.get(`${API_URL}/api/auth/config`, { headers: { Origin: origin } });
    expect(res.headers()['access-control-allow-origin'], origin).toBe(origin);
  }
});

test('an unrelated origin is still refused', async ({ request }) => {
  const res = await request.get(`${API_URL}/api/auth/config`, { headers: { Origin: 'http://evil.example' } });
  expect(res.headers()['access-control-allow-origin']).toBeUndefined();
});

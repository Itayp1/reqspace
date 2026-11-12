import { test, expect, API_URL } from './fixtures';

// The e2e harness creates the superadmin through first-run setup (tests/e2e/global-setup.ts),
// so setup must be closed by the time the tests run.
test('first-run setup is closed once a superadmin exists', async ({ request }) => {
  const config = await (await request.get(`${API_URL}/api/auth/config`)).json();
  expect(config.needsSetup).toBe(false);

  const res = await request.post(`${API_URL}/api/auth/setup`, {
    data: { name: 'Intruder', email: 'intruder@example.com', password: 'password123' },
  });
  expect(res.status()).toBe(409);
});

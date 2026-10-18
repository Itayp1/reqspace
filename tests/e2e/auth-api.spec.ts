import { test, expect } from './fixtures';

test.describe('Auth API & Security Edge Cases', () => {
  test('API requests for config should 403/401 for unauthorized users', async ({ request }) => {
    // Attempt to fetch admin config without authentication
    const response = await request.get('/api/admin/config');
    expect(response.status()).toBe(401);
  });

  test('identity headers (x-user-id / x-user-email) do not authenticate', async ({ request }) => {
    const response = await request.get('/api/auth/me', {
      headers: {
        'x-user-id': 'mocked-sso-id',
        'x-user-email': 'sso@example.com'
      }
    });
    expect(response.status()).toBe(401);
  });
});

import { test, expect } from '@playwright/test';

test.describe('Auth API & Security Edge Cases', () => {
  test('API requests for config should 403/401 for unauthorized users', async ({ request }) => {
    // Attempt to fetch admin config without authentication
    const response = await request.get('/api/admin/config');
    expect(response.status()).toBe(401);
  });

  test('SSO UID Header should auto-onboard if configured', async ({ request }) => {
    const response = await request.get('/api/auth/me', {
      headers: {
        'x-user-id': 'mocked-sso-id',
        'x-user-email': 'sso@example.com'
      }
    });
    // With default setup (SSO not explicitly configured), it should be 401.
    expect(response.status()).toBe(401);
  });
});

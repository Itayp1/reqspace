import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

// Moved from oauth/oauth-custom.spec.ts (consolidation): pure admin config validation.
test.describe('Custom OAuth2 / OIDC provider (mock identity provider)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('the admin API rejects a non-http(s) provider URL', async () => {
    const admin = await apiAsAdmin();
    const res = await admin.put('/api/admin/config', { data: { auth: { customOAuth: { authorizeUrl: 'javascript:alert(1)' } } } });
    expect(res.status()).toBe(400);
  });
});

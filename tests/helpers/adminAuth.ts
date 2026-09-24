import { APIRequestContext, expect } from '@playwright/test';

export const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005';
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin';
/** What server/reset-admin-for-tests.js resets the password to (the server's
 * own first-boot default), before the forced change-password flow runs. */
export const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

/**
 * The password the seeded superadmin is left with after global-setup runs
 * the forced first-login "change password" flow. Every spec that logs in as
 * superadmin (after global setup has run) uses this — kept in one place so
 * nothing drifts out of sync with what global-setup actually set it to.
 */
export const ADMIN_PASSWORD_AFTER_RESET = 'AdminReset!2026';

/** Plain login as the superadmin, assuming global-setup already completed
 * the reset + forced password change. Returns the session cookie + user id
 * for the caller to reuse across requests. */
export async function loginAsSuperAdmin(request: APIRequestContext) {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD_AFTER_RESET },
  });
  expect(res.ok(), 'superadmin login failed — did global-setup run?').toBeTruthy();
  const cookie = res.headers()['set-cookie']?.split(';')[0] || '';
  const data = await res.json();
  return { cookie, userId: data.user.id || data.user._id, mustChangePassword: !!data.user.mustChangePassword };
}

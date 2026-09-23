import { execSync } from 'child_process';
import path from 'path';
import {
  BASE,
  ADMIN_EMAIL,
  ADMIN_DEFAULT_PASSWORD,
  ADMIN_PASSWORD_AFTER_RESET,
} from './helpers/adminAuth';

/**
 * Runs once before the whole suite (not per worker, not per file) so the
 * reset + forced first-login password change happens exactly once — doing
 * it per spec file would race across Playwright's parallel workers, since
 * two files resetting/changing the same admin account concurrently can
 * leave one of them logging in with a password the other has already
 * replaced.
 *
 * After this runs, every spec logs in as superadmin via
 * helpers/adminAuth.loginAsSuperAdmin, which uses ADMIN_PASSWORD_AFTER_RESET.
 */
export default async function globalSetup() {
  execSync('node reset-admin-for-tests.js', {
    cwd: path.join(__dirname, '..', 'server'),
    stdio: 'inherit',
  });

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_DEFAULT_PASSWORD }),
  });
  if (!loginRes.ok) {
    throw new Error(`global-setup: superadmin login with the just-reset default password failed (${loginRes.status})`);
  }
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
  const loginData = await loginRes.json();

  if (!loginData.user?.mustChangePassword) {
    throw new Error('global-setup: expected mustChangePassword=true right after reset-admin-for-tests.js ran');
  }

  const changeRes = await fetch(`${BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ newPassword: ADMIN_PASSWORD_AFTER_RESET }),
  });
  if (!changeRes.ok) {
    throw new Error(`global-setup: forced change-password call failed (${changeRes.status})`);
  }

  console.log(`global-setup: superadmin reset and walked through the forced first-login password change.`);
}

// Applies the runtime settings the server test suites need through the admin API.
// Runtime settings are database settings (Admin > Settings > Server), applied here through
// the admin API. Run it once the server is healthy:  node scripts/apply-test-settings.js http://localhost:3005
const base = (process.argv[2] || `http://localhost:${process.env.PORT || '3005'}`).replace(/\/$/, '');
// The server never seeds a superadmin; the test suites create this one through first-run setup.
const TEST_ADMIN = { name: 'Admin', email: 'admin', password: 'admin123456' };

async function main() {
  const setup = await fetch(`${base}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_ADMIN),
  });
  if (!setup.ok && setup.status !== 409) throw new Error(`first-run setup failed (${setup.status})`);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }),
  });
  if (!login.ok) throw new Error(`admin login failed (${login.status})`);
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');

  // The suites send X-Forwarded-For to get per-test rate-limit buckets; the server does
  // not trust it by default (R5.5), so opt in. Ceilings stay at the real defaults.
  const res = await fetch(`${base}/api/admin/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      server: {
        trustProxy: '1',
        rateLimit: {
          mutationMax: 300,
          readMax: 2000,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`PUT /api/admin/config failed (${res.status})`);
  console.log('Test server settings applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

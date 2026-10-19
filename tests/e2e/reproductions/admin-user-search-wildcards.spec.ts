import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

// Bug: GET /api/admin/users?search= escapes `_` and `%` with a backslash but sends no ESCAPE clause,
// and SQLite has no default escape character, so searching for an email containing `_` found nothing.
test('admin user search finds an email that contains an underscore', async () => {
  const admin = await apiAsAdmin();
  const tag = `us_${Date.now()}`;
  const email = `${tag}@example.com`;
  const created = await admin.post('/api/admin/users', { data: { name: 'Search Me', email, password: 'password123' } });
  expect(created.ok()).toBeTruthy();

  const res = await admin.get(`/api/admin/users?search=${encodeURIComponent(tag)}`);
  const { users } = await res.json();
  expect(users.map((u: any) => u.email)).toContain(email);

  // A literal wildcard must not widen the match: `%` alone matches no email here.
  const wild = await (await admin.get(`/api/admin/users?search=${encodeURIComponent('%' + tag)}`)).json();
  expect(wild.users).toHaveLength(0);
});

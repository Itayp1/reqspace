import { test, expect } from './fixtures';
import { apiAsAdmin } from './helpers';

test('[Q1.1] admin users list: search combined with cursor paging only returns matching users', async () => {
  const admin = await apiAsAdmin();
  const tag = `q11x${Date.now()}`;
  const created: string[] = [];
  for (let i = 0; i < 3; i++) {
    const email = `${tag}_${i}@example.com`;
    const r = await admin.post('/api/admin/users', { data: { name: `Q11 ${i}`, email, password: 'password123' } });
    expect(r.status(), 'create user').toBe(201);
    created.push(email);
  }
  const seen: string[] = [];
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const r = await admin.get(`/api/admin/users?search=${tag}&limit=1${cursor ? `&cursor=${cursor}` : ''}`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    for (const u of body.users) seen.push(u.email);
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  expect(seen.sort()).toEqual([...created].sort());
});

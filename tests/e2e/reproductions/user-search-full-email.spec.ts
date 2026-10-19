import { test, expect } from '../fixtures';
import { request as playwrightRequest } from '@playwright/test';
import { API_URL } from '../fixtures';
import { apiAsAdmin } from '../helpers';

/**
 * USER-SEARCH: typing a user's full email into the member invite box returned no suggestions on
 * Postgres (LIKE with ESCAPE). A freshly registered user must be found by their full email.
 */
test('a registered user is found by typing their full email', async () => {
  const email = `Search_${Date.now()}_User@example.com`; // typed in mixed case; registration stores it lowercased
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  const reg = await anon.post('/api/auth/register', { data: { name: 'Search Target', email, password: 'password123' } });
  expect(reg.status(), await reg.text()).toBe(201);
  await anon.dispose();

  const admin = await apiAsAdmin();
  const res = await admin.get(`/api/users/search?q=${encodeURIComponent(email)}`);
  expect(res.status()).toBe(200);
  const found = await res.json() as Array<{ email: string }>;
  expect(found.map(u => u.email)).toContain(email.toLowerCase());
});

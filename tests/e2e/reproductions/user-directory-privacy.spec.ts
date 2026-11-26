import { test, expect } from '../fixtures';
import { request as playwrightRequest } from '@playwright/test';
import { API_URL } from '../fixtures';
import { apiAs } from '../helpers';

/**
 * USER-DIRECTORY: /users/search returned up to 10 users from the whole system to any signed-in
 * user (2-letter prefix of name or email), so running aa, ab, ... harvested every account.
 * Search must only return people who share a workspace with the caller, and an invite must
 * not reveal whether the email has an account: every invite is pending, with the same reply.
 */
async function register(prefix: string) {
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  const reg = await anon.post('/api/auth/register', { data: { name: `Dir ${prefix}`, email, password: 'password123' } });
  expect(reg.status(), await reg.text()).toBe(201);
  await anon.dispose();
  return email;
}

const emailsOf = async (res: any) => ((await res.json()) as Array<{ email: string }>).map(u => u.email);

test('search hides strangers, and an invite does not reveal whether the account exists', async () => {
  const ownerEmail = await register('dirowner');
  const strangerEmail = await register('dirstranger');
  const owner = await apiAs(ownerEmail);

  // A stranger is not found by a prefix or by the full email.
  expect(await emailsOf(await owner.get(`/api/users/search?q=${encodeURIComponent(strangerEmail.slice(0, 11))}`))).not.toContain(strangerEmail);
  expect(await emailsOf(await owner.get(`/api/users/search?q=${encodeURIComponent(strangerEmail)}`))).not.toContain(strangerEmail);

  const ws = await (await owner.post('/api/workspaces', { data: { name: `Dir WS ${Date.now()}` } })).json();
  const ghostEmail = `dirghost_${Date.now()}@example.com`;
  const inviteExisting = await owner.post(`/api/workspaces/${ws._id}/members`, { data: { email: strangerEmail, role: 'editor' } });
  const inviteGhost = await owner.post(`/api/workspaces/${ws._id}/members`, { data: { email: ghostEmail, role: 'viewer' } });
  expect(inviteExisting.status()).toBe(inviteGhost.status());
  // Same reply apart from echoing back what was sent.
  const [a, b] = [await inviteExisting.json(), await inviteGhost.json()];
  expect(a).toEqual({ message: b.message, invite: { email: strangerEmail, role: 'editor' } });
  expect(b.invite).toEqual({ email: ghostEmail, role: 'viewer' });

  // Both show only as pending invites until the invitee next uses the app.
  let detail = await (await owner.get(`/api/workspaces/${ws._id}`)).json();
  expect(detail.members.map((m: any) => m.userId?.email)).not.toContain(strangerEmail);
  expect(detail.invites.map((i: any) => i.email).sort()).toEqual([ghostEmail, strangerEmail].sort());

  // The existing user joins on their next request; the other one on registering.
  const stranger = await apiAs(strangerEmail);
  expect((await stranger.get('/api/workspaces')).ok()).toBeTruthy();
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  expect((await anon.post('/api/auth/register', { data: { name: 'Ghost', email: ghostEmail, password: 'password123' } })).status()).toBe(201);
  expect((await anon.get('/api/workspaces')).ok()).toBeTruthy();
  await anon.dispose();

  detail = await (await owner.get(`/api/workspaces/${ws._id}`)).json();
  const members = detail.members.map((m: any) => [m.userId?.email, m.role]);
  expect(members).toContainEqual([strangerEmail, 'editor']);
  expect(members).toContainEqual([ghostEmail, 'viewer']);
  expect(detail.invites).toEqual([]);

  // Now that they share a workspace, the former stranger is found by prefix.
  expect(await emailsOf(await owner.get(`/api/users/search?q=${encodeURIComponent(strangerEmail.slice(0, 11))}`))).toContain(strangerEmail);
});

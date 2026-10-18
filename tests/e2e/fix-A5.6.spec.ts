import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_URL } from './fixtures';
import { apiAsAdmin } from './helpers';

/**
 * (Admin-created users are always flagged mustChangePassword; the create schema rejects the field.)
 * A5.6 — while a user is flagged mustChangePassword, direct API calls (with a
 * valid session cookie) must be refused server-side with 403, except the few
 * endpoints the password-change flow itself needs.
 */

let seq = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
const ip = () => `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function anon(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
}

test.describe('A5.6 forced password change enforced server-side', () => {
  test('[A5.6] mustChangePassword session gets 403 on data APIs, can still change password, then regains access', async () => {
    const admin = await apiAsAdmin();
    const email = `${uniq('fa56')}@example.com`;
    const created = await admin.post('/api/admin/users', {
      data: { name: 'Forced', email, password: 'password123' },
    });
    expect(created.ok(), `admin create user: ${created.status()}`).toBeTruthy();

    const ctx = await anon();
    const login = await ctx.post('/api/auth/login', { data: { email, password: 'password123' } });
    expect(login.ok(), 'login').toBeTruthy();

    // The flag is visible to the client and the modal flow endpoints stay open.
    const me = await ctx.get('/api/auth/me');
    expect(me.status()).toBe(200);
    expect(JSON.stringify(await me.json())).toContain('mustChangePassword');

    // Direct API calls are blocked, for reads and writes alike.
    for (const p of ['/api/workspaces', '/api/requests', '/api/admin/users', '/api/workspaces/?x=1']) {
      const r = await ctx.get(p);
      expect(r.status(), `GET ${p}`).toBe(403);
    }
    const write = await ctx.post('/api/workspaces', { data: { name: uniq('bypass') } });
    expect(write.status(), 'POST /api/workspaces').toBe(403);
    expect((await write.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');

    // Changing the password is allowed and lifts the block.
    const change = await ctx.post('/api/auth/change-password', {
      data: { currentPassword: 'password123', newPassword: 'password456' },
    });
    expect(change.status(), 'change-password').toBe(200);
    expect((await ctx.get('/api/workspaces')).status(), 'after change').toBe(200);
  });
});

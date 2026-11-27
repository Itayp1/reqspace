import { expect, API_URL, request as pwRequest, type APIRequestContext, type Page } from '../fixtures';

export const PASSWORD = 'password123';
let seq = 0;

export async function newCtx(): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { 'X-Forwarded-For': `10.${200 + (seq++ % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` },
  });
}

/** A registered user with a logged-in API context. */
export async function makeUser(prefix: string) {
  const ctx = await newCtx();
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const reg = await ctx.post('/api/auth/register', { data: { name: `${prefix} user`, email, password: PASSWORD } });
  expect(reg.ok(), 'register').toBeTruthy();
  const login = await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } });
  expect(login.ok(), 'login').toBeTruthy();
  const { user } = await login.json();
  return { ctx, email, id: user.id as string };
}

export async function makeWorkspace(ctx: APIRequestContext, name = `Links WS ${Date.now()}`): Promise<string> {
  const res = await ctx.post('/api/workspaces', { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json())._id;
}

export async function createLink(ctx: APIRequestContext, wsId: string, o: { role?: string; singleUse?: boolean; expiresIn?: string } = {}) {
  const res = await ctx.post(`/api/workspaces/${wsId}/invite-links`, { data: { role: 'viewer', singleUse: false, expiresIn: '1h', ...o } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { link: { id: string; role: string; singleUse: boolean; expiresAt: string }; token: string };
}

export async function members(ctx: APIRequestContext, wsId: string) {
  return (await (await ctx.get(`/api/workspaces/${wsId}`)).json()).members as Array<{ userId: { _id: string }; role: string }>;
}

export async function openSettingsTab(page: Page, tab: 'workspace-members-tab' | 'workspace-links-tab') {
  await page.getByTestId('workspace-settings-btn').click();
  await page.getByTestId(tab).click();
}

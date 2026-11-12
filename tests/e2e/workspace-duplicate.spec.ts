import { test, expect, request as pwRequest } from './fixtures';

// the 403 for a non-owner is provoked on purpose
test.use({ allowFpErrors: [/server-auth|status code 403/] });

const BASE = process.env.REQSPACE_API_URL || 'http://localhost:3005';
const ip = () => `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.2.2`;

async function user(name: string) {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  const email = `${name}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  expect((await ctx.post('/api/auth/register', { data: { name, email, password: 'password123' } })).ok()).toBeTruthy();
  expect((await ctx.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy();
  return { ctx, email };
}

test('duplicating a workspace copies content and members; opt-outs are honoured', async () => {
  const owner = await user('dupowner');
  const editor = await user('dupeditor');
  const ws = await (await owner.ctx.post('/api/workspaces', { data: { name: 'Src' } })).json();
  await owner.ctx.post(`/api/workspaces/${ws._id}/members`, { data: { email: editor.email, role: 'editor' } });
  const col = await (await owner.ctx.post(`/api/workspaces/${ws._id}/collections`, { data: { name: 'Col' } })).json();
  const folder = await (await owner.ctx.post(`/api/collections/${col._id}/folders`, { data: { name: 'Fol' } })).json();
  await owner.ctx.post(`/api/collections/${col._id}/requests`, { data: { name: 'Req', method: 'GET', url: 'http://x', folderId: folder._id } });
  await owner.ctx.post(`/api/workspaces/${ws._id}/environments`, { data: { name: 'Env', variables: [{ key: 'tok', value: 's3cret', type: 'secret', enabled: true }] } });

  // Everything on by default.
  const full = await owner.ctx.post(`/api/workspaces/${ws._id}/duplicate`, { data: { name: 'Copy' } });
  expect(full.status()).toBe(201);
  const copy = await full.json();
  expect(copy.members.map((m: any) => m.role).sort()).toEqual(['editor', 'owner']);
  const cols = await (await owner.ctx.get(`/api/workspaces/${copy._id}/collections`)).json();
  expect(cols.map((c: any) => c.name)).toEqual(['Col']);
  const envs = await (await owner.ctx.get(`/api/workspaces/${copy._id}/environments`)).json();
  expect(envs[0].variables[0].value).toBe('s3cret');
  // The editor can see the copy.
  expect((await editor.ctx.get(`/api/workspaces/${copy._id}`)).ok()).toBeTruthy();

  // Opt out of members and secret values.
  const lean = await (await owner.ctx.post(`/api/workspaces/${ws._id}/duplicate`, { data: { name: 'Lean', includeMembers: false, includeSecretValues: false } })).json();
  expect(lean.members).toHaveLength(1);
  const leanEnvs = await (await owner.ctx.get(`/api/workspaces/${lean._id}/environments`)).json();
  expect(leanEnvs[0].variables[0].value).toBe('');

  // Only owners may duplicate.
  expect((await editor.ctx.post(`/api/workspaces/${ws._id}/duplicate`, { data: { name: 'Nope' } })).status()).toBe(403);
});

import { test, expect } from './fixtures';
import { request as pwRequest } from '@playwright/test';
import { API_URL } from './fixtures';
import { apiAsAdmin } from './helpers';

let seq = 0;
const ip = () => `10.${200 + (seq++ % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

test.describe('Q6.5 audit log escaping (API)', () => {
  test('[Q6.5] audit-log response never carries raw HTML from user-controlled names', async () => {
    const admin = await apiAsAdmin();
    const marker = `q65_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
    const name = `<img src=x onerror=alert(1)>${marker}`;
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
    const reg = await ctx.post('/api/auth/register', { data: { name: 'QA User', email: `${marker}@example.com`, password: 'password123' } });
    expect(reg.status(), 'register').toBe(201);
    const wsList = await (await ctx.get('/api/workspaces')).json();
    const wsId = (Array.isArray(wsList) ? wsList : wsList.workspaces)[0]._id ?? (Array.isArray(wsList) ? wsList : wsList.workspaces)[0].id;
    const created = await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name } });
    expect(created.ok(), 'create collection').toBeTruthy();

    let raw = '';
    await expect.poll(async () => {
      raw = await (await admin.get('/api/admin/logs?action=collection.create&limit=200')).text();
      return raw.includes(marker);
    }, { timeout: 10_000 }).toBe(true);

    expect(raw).not.toContain('<img');
    expect(raw).not.toContain('>');
    // The data itself is intact once parsed; React then renders it as plain text.
    expect(JSON.parse(raw).logs.some((l: any) => l.details?.name === name)).toBe(true);
  });
});

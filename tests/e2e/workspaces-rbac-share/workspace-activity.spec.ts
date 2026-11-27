import { test, expect } from '../fixtures';
import { registerUser, apiAs, activeWorkspaceId } from '../helpers';
import { makeUser, makeWorkspace } from './invite-helpers';

test('the Activity tab lists audit entries for what the workspace did', async ({ page }) => {
  const email = await registerUser(page, 'activity', 'Group User');
  const wsId = await activeWorkspaceId(page);
  const api = await apiAs(email);
  const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Group Collection' } })).json();
  const made = await api.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'Group Request', method: 'GET', url: 'https://group.example.com/thing' } });
  expect(made.ok()).toBeTruthy();
  await api.dispose();
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();

  await page.getByTestId('workspace-settings-btn').click();
  await expect(page.getByTestId('workspace-general-tab')).toBeVisible();

  await page.getByTestId('workspace-activity-tab').click();
  await expect(page.getByRole('heading', { name: 'Workspace Activity' })).toBeVisible();

  // A request was created in this workspace, so the audit log can't be empty. GET /workspaces/:id/activity
  // filters by targetId = workspace id, so an entry only shows up if the write recorded the workspace.
  const entries = page.getByTestId('activity-log-entry');
  const created = entries.filter({ hasText: 'create_request' });
  await expect(created.first()).toBeVisible();
  await expect(created.first()).toContainText('Group User');
  await expect(created.first()).toContainText('Group Request');
  await expect(page.getByText('No recent activity found.')).toBeHidden();

  // The tab switch is reversible and doesn't lose the General tab's fields.
  await page.getByTestId('workspace-general-tab').click();
  await expect(page.getByTestId('workspace-name-input')).toBeVisible();
});

test.describe('Workspace activity API', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('[B5.5] a role change is recorded in the workspace activity log', async () => {
    const owner = await makeUser('b55o');
    const member = await makeUser('b55m');
    const wsId = await makeWorkspace(owner.ctx);
    await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: member.email, role: 'viewer' } });
    await member.ctx.get('/api/workspaces'); // a pending invite becomes a membership on the invitee's next request
    await owner.ctx.put(`/api/workspaces/${wsId}/members/${member.id}`, { data: { role: 'editor' } });
    const log: any[] = await (await owner.ctx.get(`/api/workspaces/${wsId}/activity`)).json();
    expect(log.some((l) => /role/i.test(l.action))).toBe(true);
  });

  test('[B7.1] the workspace activity log records collection / request / folder changes', async () => {
    const { ctx } = await makeUser('b71');
    const wsId = await makeWorkspace(ctx);
    const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C' } })).json();
    const colId = col.id ?? col._id;
    await ctx.post(`/api/collections/${colId}/folders`, { data: { name: 'F' } });
    await ctx.post(`/api/collections/${colId}/requests`, { data: { name: 'R', method: 'GET', url: 'http://x' } });
    const log: any[] = await (await ctx.get(`/api/workspaces/${wsId}/activity`)).json();
    const actions = log.map((l) => String(l.action));
    expect(actions.some((a) => /collection/i.test(a)), actions.join(',')).toBe(true);
    expect(actions.some((a) => /folder/i.test(a)), actions.join(',')).toBe(true);
    expect(actions.some((a) => /request/i.test(a)), actions.join(',')).toBe(true);
  });

  test('[B7.2] the activity endpoint pages past 50 entries', async () => {
    const { ctx } = await makeUser('b72');
    const wsId = await makeWorkspace(ctx);
    for (let i = 0; i < 3; i++) await ctx.put(`/api/workspaces/${wsId}`, { data: { name: `rename_${Date.now()}_${i}` } });
    const first: any[] = await (await ctx.get(`/api/workspaces/${wsId}/activity?limit=1`)).json();
    const second: any[] = await (await ctx.get(`/api/workspaces/${wsId}/activity?limit=1&skip=1`)).json();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]._id ?? second[0].id).not.toBe(first[0]._id ?? first[0].id);
  });
});

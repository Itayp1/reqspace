import { test, expect } from '../fixtures';
import { registerUser, apiAs, activeWorkspaceId } from '../helpers';

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

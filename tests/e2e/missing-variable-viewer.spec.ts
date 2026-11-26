import { test, expect } from './fixtures';
import { registerUser, apiAs, selectWorkspace, activeWorkspaceId } from './helpers';

test('viewer: missing-variable modal offers Personal only', async ({ page, browser }) => {
  const ownerEmail = await registerUser(page, 'mvowner');
  const wsId = await activeWorkspaceId(page);
  const owner = await apiAs(ownerEmail);
  expect((await owner.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'MV Env', variables: [] } })).ok()).toBeTruthy();
  const col = await (await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'MVV Col' } })).json();
  const made = await owner.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'MVV Req', method: 'GET', url: 'https://mvv.example.test/{{viewerVar}}' } });
  expect(made.ok()).toBeTruthy();

  const viewerPage = await browser.newPage();
  const viewerEmail = await registerUser(viewerPage, 'mvviewer');
  expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).ok()).toBeTruthy();
  await viewerPage.reload();
  await expect(viewerPage.getByTestId('workspace-select')).toBeVisible();
  await selectWorkspace(viewerPage, wsId);

  await viewerPage.route('https://mvv.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await viewerPage.getByTestId('node-MVV Col').click();
  await viewerPage.getByTestId('node-MVV Req').click();
  await viewerPage.getByTestId('request-send-btn').click();

  const scope = viewerPage.getByLabel('Scope for viewerVar');
  await expect(scope).toHaveValue('profile');
  for (const s of ['environment', 'collection', 'global']) {
    await expect(scope.locator(`option[value="${s}"]`)).toBeDisabled();
  }
  await expect(viewerPage.getByTestId('missing-variables-modal')).toContainText('view-only access');
  await viewerPage.close();
});

import { test, expect } from './fixtures';
import { registerUser, apiAs, activeWorkspaceId } from './helpers';

test.use({ viewport: { width: 1800, height: 900 } });

test('hovering a {{variable}} in the URL shows its value and source', async ({ page }) => {
  const email = await registerUser(page, 'varhover');
  const wsId = await activeWorkspaceId(page);
  const api = await apiAs(email);
  const mkVar = (key: string, value: string, extra = {}) => ({ key, initialValue: value, currentValue: value, isSecret: false, enabled: true, ...extra });
  expect((await api.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'Hover Env', variables: [mkVar('host', 'env-host.test'), mkVar('ak', 'sekret', { isSecret: true }), mkVar('pl', 'only-env')] } })).ok()).toBeTruthy();
  expect((await api.put('/api/user-profile-variables', { data: { variables: [{ key: 'host', value: 'profile-host.test', enabled: true, type: 'default' }] } })).ok()).toBeTruthy();
  const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Hover Col' } })).json();
  const made = await api.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'Hover Req', method: 'GET', url: 'https://{{host}}/{{pl}}/{{ak}}/{{$timestamp}}/{{no}}' } });
  expect(made.ok()).toBeTruthy();

  await page.reload();
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('env-node-Hover Env').click();
  await page.getByTestId('env-active-select').selectOption({ label: 'Hover Env' });
  await page.getByTestId('tab-collections').click();
  await page.getByTestId('node-Hover Col').click();
  await page.getByTestId('node-Hover Req').click();
  await expect(page.getByTestId('request-url-input')).toHaveValue(/\{\{host\}\}/);

  // The extension banner slides in late and shifts the layout; wait for it so positions are stable.
  await page.getByText('Extension not active').waitFor({ timeout: 5000 }).catch(() => {});
  const tip = page.getByTestId('variable-hover');
  const hover = async (name: string) => {
    const box = (await page.locator(`[data-var="${name}"]`).first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };

  await hover('pl');
  await expect(tip).toContainText('pl');
  await expect(page.getByTestId('variable-hover-value')).toHaveText('only-env');
  await expect(page.getByTestId('variable-hover-source')).toHaveText(/Environment Hover Env/);

  // The profile value wins over the environment one, and the tooltip says so.
  await hover('host');
  await expect(page.getByTestId('variable-hover-value')).toHaveText('profile-host.test');
  await expect(page.getByTestId('variable-hover-source')).toContainText('Source: Profile');
  await expect(page.getByTestId('variable-hover-source')).toContainText('overrides Environment Hover Env');

  await hover('ak');
  await expect(page.getByTestId('variable-hover-value')).toHaveText('••••');

  await hover('$timestamp');
  await expect(page.getByTestId('variable-hover-source')).toHaveText('Dynamic value');
  await hover('no');
  await expect(page.getByTestId('variable-hover-source')).toHaveText('Not defined in any scope');

  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
});

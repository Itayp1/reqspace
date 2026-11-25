import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/**
 * Right-clicking a {{variable}} shows which scope its value comes from and lets the user edit it there.
 * Precedence: profile > environment > global, so a name defined in several scopes shows the winner
 * and lists the shadowed values.
 */
test('right-click on a variable shows its source scope and edits it in that scope', async ({ page }) => {
  await registerUser(page, 'varctx');
  const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
  const v = (key: string, value: string) => ({ key, initialValue: value, currentValue: value, enabled: true, type: 'default' });

  const env = await (await page.request.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'Staging', variables: [v('host', 'env-host'), v('both', 'env-both')] } })).json();
  await page.request.put(`/api/workspaces/${wsId}/global-environment`, { data: { variables: [v('both', 'global-both')] } });
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await page.getByTestId('env-select').selectOption(env._id);

  await page.getByTestId('create-request-btn').click();
  const url = page.getByTestId('request-url-input');
  await url.fill('{{host}}');
  await url.click({ button: 'right', position: { x: 20, y: 10 } });

  const pop = page.getByTestId('variable-popover');
  await expect(pop).toBeVisible();
  await expect(page.getByTestId('variable-popover-source')).toContainText('Environment');
  await page.getByTestId('variable-popover-input').fill('edited-host');
  await page.getByTestId('variable-popover-save').click();

  const saved = await (await page.request.get(`/api/workspaces/${wsId}/environments`)).json();
  const staging = saved.find((e: any) => e._id === env._id);
  expect(staging.variables.find((x: any) => x.key === 'host').currentValue).toBe('edited-host');

  // a name defined in two scopes: the environment wins and the global value is listed as shadowed
  await url.fill('{{both}}');
  await url.click({ button: 'right', position: { x: 20, y: 10 } });
  await expect(page.getByTestId('variable-popover-source')).toContainText('Environment');
  await expect(page.getByTestId('variable-popover-shadowed')).toContainText('Global');
  await expect(page.getByTestId('variable-popover-shadowed')).toContainText('global-both');
});

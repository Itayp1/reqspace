import { test, expect } from '../fixtures';
import { registerUser, apiAs, selectWorkspace, activeWorkspaceId } from '../helpers';

test.describe('variable hover tooltip', () => {
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
});


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

test('variable name field suggests current-env names, then other sources, then system variables', async ({ page }) => {
  const email = await registerUser(page, 'keysug');
  const wsId = await activeWorkspaceId(page);
  const api = await apiAs(email);
  const mk = (key: string) => ({ key, initialValue: 'v', currentValue: 'v', isSecret: false, enabled: true });
  expect((await api.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'Env A', variables: [mk('tokenA'), mk('editedKey')] } })).ok()).toBeTruthy();
  expect((await api.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'Env B', variables: [mk('tokenB')] } })).ok()).toBeTruthy();
  expect((await api.put('/api/user-profile-variables', { data: { variables: [{ key: 'tokenProfile', value: 'x', enabled: true, type: 'default' }] } })).ok()).toBeTruthy();
  await page.reload();
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('env-node-Env A').click();

  const options = page.getByTestId('var-name-option');
  const key1 = page.getByTestId('env-var-key-1');
  await key1.fill('');
  await expect(page.getByRole('listbox', { name: 'Variable name suggestions' })).toBeVisible();

  // Typing narrows; own row is excluded, current env first, then other sources, then dynamic.
  await key1.fill('token');
  await expect(options).toHaveText([/tokenA.*This environment/, /tokenProfile.*Profile/, /tokenB.*Env B/]);
  await key1.fill('time');
  await expect(options.first()).toContainText('$timestamp');
  await expect(options.first()).toContainText('Dynamic');

  // Enter with nothing highlighted keeps the typed free name; the list is not hijacking it.
  await key1.fill('myNewKey');
  await expect(options).toHaveCount(0);
  await key1.press('Enter');
  await expect(key1).toHaveValue('myNewKey');

  // Keyboard pick.
  await key1.fill('tokenB');
  await key1.fill('token');
  await key1.press('ArrowDown');
  await key1.press('Enter');
  await expect(key1).toHaveValue('tokenA');
  await expect(options).toHaveCount(0);

  // Mouse pick, and Escape closes without clearing.
  await key1.fill('tokenP');
  await options.first().click();
  await expect(key1).toHaveValue('tokenProfile');
  await key1.fill('tok');
  await key1.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(key1).toHaveValue('tok');

  // A freshly added row shows the list on focus.
  await page.getByTestId('add-env-var-btn').click();
  await expect(page.getByTestId('env-var-key-2')).toBeFocused();
  await expect(options.first()).toContainText('tokenA');
  await page.getByTestId('env-var-key-2').press('Escape');
});

test.describe('Environment quick look: copy and inline edit', () => {
  test('owner edits a value inline (persists); viewer can copy but not edit', async ({ page, browser }) => {
    const ownerEmail = await registerUser(page, 'qlowner');
    const wsId = await activeWorkspaceId(page);
    const owner = await apiAs(ownerEmail);
    const created = await owner.post(`/api/workspaces/${wsId}/environments`, {
      data: { name: 'QL Env', variables: [{ key: 'api_host', initialValue: 'old-value', currentValue: 'old-value', enabled: true }] },
    });
    expect(created.ok()).toBeTruthy();
    const envId = (await created.json())._id;

    const viewerPage = await browser.newPage();
    const viewerEmail = await registerUser(viewerPage, 'qlviewer');
    expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).ok()).toBeTruthy();

    // Owner
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('env-select').selectOption(envId);
    await page.getByRole('button', { name: 'Environment quick look and edit' }).click();
    await expect(page.getByRole('button', { name: 'Copy api_host value' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit api_host value' }).click();
    const input = page.getByLabel('Value of api_host');
    await input.fill('new-value');
    await input.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Environment variables quick look' })).toContainText('new-value');

    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByRole('button', { name: 'Environment quick look and edit' }).click();
    await expect(page.getByRole('dialog', { name: 'Environment variables quick look' })).toContainText('new-value');

    // Viewer: same workspace and environment, copy yes, edit no.
    await viewerPage.reload();
    await expect(viewerPage.getByTestId('workspace-select')).toBeVisible();
    await selectWorkspace(viewerPage, wsId);
    await viewerPage.getByTestId('env-select').selectOption(envId);
    await viewerPage.getByRole('button', { name: 'Environment quick look and edit' }).click();
    await expect(viewerPage.getByRole('button', { name: 'Copy api_host value' })).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Edit api_host value' })).toHaveCount(0);
    await viewerPage.close();
  });
});

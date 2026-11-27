import { test, expect } from '../fixtures';
import { registerUser, apiAs, activeWorkspaceId } from '../helpers';

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

import { test, expect } from './fixtures';

/**
 * Variable scopes below the environment level had no e2e coverage:
 *  - collection variables (GroupEditModal's Variables tab)
 *  - workspace-local variables  (PUT /local-variables/:workspaceId)
 *  - cross-workspace profile variables (PUT /user-profile-variables)
 *
 * environments.spec.ts already covers globals-vs-environment precedence, so
 * this file starts where that one stops and pins the rest of the chain:
 * globals < environment < collection < profile < workspace-local.
 */
test.describe('Variable Scopes', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const EMAIL = `varscope_${ts}@example.com`;
  const COLLECTION = `Scope Collection ${ts}`;

  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(EMAIL);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }

  test('register, and give a collection its own variables', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Scope User');
    await page.getByTestId('register-email').fill(EMAIL);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill(COLLECTION);
    await page.getByTestId('prompt-submit').click();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${COLLECTION}`) });
    await expect(colNode).toBeVisible();

    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-edit').click();

    // Collections open on the Variables tab; folders have no such tab.
    await page.getByTestId('group-edit-variables-tab').click();
    await page.getByTestId('group-add-var-btn').click();
    await page.getByTestId('group-var-key-0').fill('host');
    await page.getByTestId('group-var-val-0').fill('collection-host.example.com');
    await page.getByTestId('group-add-var-btn').click();
    await page.getByTestId('group-var-key-1').fill('shadowed');
    await page.getByTestId('group-var-val-1').fill('from-collection');
    await page.getByTestId('group-edit-save-btn').click();

    // Reopening has to show what was saved, not an empty table.
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-edit').click();
    await page.getByTestId('group-edit-variables-tab').click();
    await expect(page.getByTestId('group-var-key-0')).toHaveValue('host');
    await expect(page.getByTestId('group-var-val-0')).toHaveValue('collection-host.example.com');
    await page.keyboard.press('Escape');
  });

  test('a collection variable resolves in a request saved under it', async ({ page }) => {
    await login(page);
    await page.route('https://collection-host.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );

    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${COLLECTION}`) });
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Scoped Request');
    await page.getByTestId('prompt-submit').click();
    await page.getByTestId('node-Scoped Request').click();

    // {{host}} only resolves because the request belongs to the collection
    // that declares it — the collection id is what scopes the lookup.
    await page.getByTestId('request-url-input').fill('https://{{host}}/ping');
    const sent = page.waitForRequest((r) => r.url().includes('collection-host.example.com'));
    await page.getByTestId('request-send-btn').click();
    expect((await sent).url()).toBe('https://collection-host.example.com/ping');
    await expect(page.getByTestId('response-status')).toContainText('200');
  });

  test('workspace-local variables save, reload and resolve', async ({ page }) => {
    await login(page);
    await page.route('https://local-host.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );

    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-local-variables-btn').click();
    const editor = page.getByTestId('local-variables-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('Not synced to other users');

    await editor.getByRole('button', { name: 'Add Variable' }).click();
    await editor.getByPlaceholder('New variable').last().fill('localhostname');
    await editor.getByPlaceholder('Value').last().fill('local-host.example.com');
    await editor.getByRole('button', { name: 'Save' }).click();

    // Round-trips through the server: a reload re-fetches them.
    await page.reload();
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-local-variables-btn').click();
    await expect(editor.getByPlaceholder('New variable').first()).toHaveValue('localhostname');

    await page.getByTestId('tab-collections').click();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://{{localhostname}}/ping');
    const sent = page.waitForRequest((r) => r.url().includes('local-host.example.com'));
    await page.getByTestId('request-send-btn').click();
    expect((await sent).url()).toBe('https://local-host.example.com/ping');
  });

  test('profile variables save, reload and resolve in a request', async ({ page }) => {
    await login(page);
    await page.route('https://profile-host.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );

    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-local-variables-btn').click();
    const editor = page.getByTestId('local-variables-editor');
    await editor.getByRole('button', { name: /Profile Variables/ }).click();
    await expect(editor).toContainText('all workspaces');

    await editor.getByRole('button', { name: 'Add Variable' }).click();
    await editor.getByPlaceholder('New variable').last().fill('profilehost');
    await editor.getByPlaceholder('Value').last().fill('profile-host.example.com');
    await editor.getByRole('button', { name: 'Save' }).click();

    await page.reload();
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-local-variables-btn').click();
    await editor.getByRole('button', { name: /Profile Variables/ }).click();
    await expect(editor.getByPlaceholder('New variable').first()).toHaveValue('profilehost');

    await page.getByTestId('tab-collections').click();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://{{profilehost}}/ping');
    const sent = page.waitForRequest((r) => r.url().includes('profile-host.example.com'));
    await page.getByTestId('request-send-btn').click();
    expect((await sent).url()).toBe('https://profile-host.example.com/ping');
  });

  test('a workspace-local variable wins over the collection variable of the same name', async ({ page }) => {
    await login(page);
    await page.route('https://precedence.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );

    // "shadowed" is already set to from-collection by the first test.
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-local-variables-btn').click();
    const editor = page.getByTestId('local-variables-editor');
    await editor.getByRole('button', { name: 'Add Variable' }).click();
    await editor.getByPlaceholder('New variable').last().fill('shadowed');
    await editor.getByPlaceholder('Value').last().fill('from-local');
    await editor.getByRole('button', { name: 'Save' }).click();

    await page.getByTestId('tab-collections').click();
    await page.getByTestId(`node-${COLLECTION}`).click();
    await page.getByTestId('node-Scoped Request').click();
    await page.getByTestId('request-url-input').fill('https://precedence.example.com/?v={{shadowed}}');

    const sent = page.waitForRequest((r) => r.url().includes('precedence.example.com'));
    await page.getByTestId('request-send-btn').click();
    expect((await sent).url()).toContain('v=from-local');
  });
});

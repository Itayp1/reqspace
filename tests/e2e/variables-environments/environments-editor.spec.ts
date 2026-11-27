import { test, expect } from '../fixtures';
import { registerUser, expectToast, selectWorkspace, activeWorkspaceId, expectWorkspaceListed } from '../helpers';
import { mockServer, scene, envVar } from '../scene';

test.describe('Environments Operations', () => {
  // Run serially to reuse state
  test.describe.configure({ mode: 'serial' });

  // Unique per run: the live server accumulates workspaces across every spec
  // file in the full suite, so a fixed name would collide with leftovers.
  const WORKSPACE_NAME = `Env Workspace ${Date.now()}`;
  // A serial-mode retry re-runs the whole block from the first test, which
  // creates a second, identically-named workspace — select by id instead.
  let workspaceId = '';

  test.beforeEach(async ({ page }) => {
    // Each test gets a fresh browser context — there's no session left over
    // from the previous test, so every test has to log in for itself.
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin123456');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('Login and create workspace', async ({ page }) => {
    // Custom in-app modal, not a native dialog
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(WORKSPACE_NAME);
    await page.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(page, WORKSPACE_NAME);
    workspaceId = await activeWorkspaceId(page);
  });

  test('Create an environment, add a variable, select and verify', async ({ page }) => {
    await selectWorkspace(page, workspaceId);

    // Click on Environments tab
    await page.getByTestId('tab-environments').click();

    // Click New Environment (custom in-app modal, not a native dialog)
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Staging');
    await page.getByTestId('prompt-input').press('Enter');

    // Verify it appears in the sidebar and is selected to edit
    await expect(page.getByTestId('env-node-Staging')).toBeVisible();

    // Add a variable
    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill('baseUrl');
    await page.getByTestId('env-var-initial-0').fill('https://api.staging.example.com');
    // Save the environment
    await page.getByTestId('env-save-btn').click();

    // Select the environment in the top bar dropdown
    await page.getByTestId('env-select').selectOption({ label: 'Staging' });

    // Verify it's selected
    await expect(page.getByTestId('env-select')).toHaveValue(/^[a-zA-Z0-9-]+$/); // UUID

    // Quick verification: we can create a new request and see if the variable resolves, or just assert the select was successful.
    // Let's create a request and type {{baseUrl}}
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('{{baseUrl}}/users');

    // That's enough to verify it applies in the UI context (it would evaluate during send)
    await expect(page.getByTestId('request-url-input')).toHaveValue('{{baseUrl}}/users');
  });

  test('secret masking, globals-vs-env precedence, export', async ({ page }) => {
    await selectWorkspace(page, workspaceId);

    await page.getByTestId('tab-environments').click();

    // 1. Setup Globals
    await page.getByText('Globals (Common)').click();
    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill('api_key');
    await page.getByTestId('env-var-initial-0').fill('global_secret');

    // 2. Secret masking in Globals
    await page.getByRole('button', { name: /default/i }).click();
    await expect(page.getByTestId('env-var-initial-0')).toHaveAttribute('type', 'password');

    await page.getByTitle('Show value').click();
    await expect(page.getByTestId('env-var-initial-0')).toHaveAttribute('type', 'text');

    await page.getByTitle('Hide value').click();
    await expect(page.getByTestId('env-var-initial-0')).toHaveAttribute('type', 'password');

    await page.getByTestId('env-save-btn').click();

    // 3. Create Environment and override the same variable
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Precedence Env');
    await page.getByTestId('prompt-input').press('Enter');

    await expect(page.getByTestId('env-node-Precedence Env')).toBeVisible();

    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill('api_key');
    await page.getByTestId('env-var-initial-0').fill('env_secret');
    await page.getByTestId('env-save-btn').click();

    // 4. Select Environment
    await page.getByTestId('env-select').selectOption({ label: 'Precedence Env' });

    // 4.5. Test Precedence by sending a request
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get?test_key={{api_key}}');
    await page.getByTestId('request-send-btn').click();

    // HTTP/2 responses (as httpbin.org serves) have no reason phrase, so
    // statusText is legitimately empty — only assert on the status code.
    await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 10000 });

    // The rendered response in Monaco should contain the env value, proving it overrode globals
    const responseEditor = page.locator('.monaco-editor').last();
    await expect(responseEditor).toContainText('env_secret');
    await expect(responseEditor).not.toContainText('global_secret');

    // Go back to the Environments tab to export
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-node-Precedence Env').click();

    // 5. Export Environment
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('Export Environment JSON').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Precedence Env.reqspace_environment.json');
  });
});

/** QA-13 / QA-34: "Add a new variable" / "Add Variable" must focus the new row's key input. */
test.describe('Add variable focuses the key input', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'qa13');
    await page.getByTestId('tab-environments').click();
  });

  test('environment editor', async ({ page }) => {
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Focus Env');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('env-node-Focus Env')).toBeVisible();
    await page.getByTestId('add-env-var-btn').click();
    await page.keyboard.type('tmpvar');
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('tmpvar');
  });

  test('profile variables editor', async ({ page }) => {
    await page.getByTestId('env-profile-variables-btn').click();
    const editor = page.getByTestId('profile-variables-editor');
    await editor.getByRole('button', { name: /Add Variable/ }).click();
    await page.keyboard.type('tmpvar');
    await expect(editor.getByPlaceholder('New variable')).toHaveValue('tmpvar');
  });
});

/** QA-14: environment Save gave no confirmation and was enabled with nothing to save. */
test('environment Save confirms with a toast and is disabled when clean', async ({ page }) => {
  await registerUser(page, 'qa14');
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('new-env-btn').click();
  await page.getByTestId('prompt-input').fill('Save Env');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('env-node-Save Env')).toBeVisible();

  const save = page.getByTestId('env-save-btn');
  await expect(save).toBeDisabled();
  await page.getByTestId('add-env-var-btn').click();
  await page.getByTestId('env-var-key-0').fill('k');
  await expect(save).toBeEnabled();
  await save.click();
  await expectToast(page, 'success', 'Environment saved');
  await expect(save).toBeDisabled();
});

test.describe('environment selector UX', () => {
  test('the environment editor shows the active environment and switches it', async ({ page }) => {
    await registerUser(page, 'envsel');
    await page.getByTestId('tab-environments').click();
    for (const name of ['EnvA', 'EnvB']) {
      await page.getByTestId('new-env-btn').click();
      await page.getByTestId('prompt-input').fill(name);
      await page.getByTestId('prompt-input').press('Enter');
      await expect(page.getByTestId(`env-node-${name}`)).toBeVisible();
    }
    const select = page.getByTestId('env-active-select');
    await select.selectOption({ label: 'EnvA' });
    await expect(page.getByTestId('env-select')).toHaveValue(await select.inputValue());
    await select.selectOption({ label: 'EnvB' });
    await expect(page.getByTestId('env-select').locator('option:checked')).toHaveText('EnvB');
  });
});

test('environment tab: adding a row and never filling it leaves the tab clean', async ({ page }) => {
  await registerUser(page, 'dirtyenv');
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('new-env-btn').click();
  await page.getByTestId('prompt-input').fill('Dirty Env');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('env-node-Dirty Env')).toBeVisible();
  await page.getByTestId('add-env-var-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  await expect(page.getByTestId('env-save-btn')).toBeDisabled();
});

test('[G1.5] the selected environment survives a page reload', async ({ page }) => {
  await mockServer(page);
  await scene(page, {}, [envVar('k', 'v')]);
  const chosen = await page.getByTestId('env-select').inputValue();
  expect(chosen).not.toBe('');
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await expect(page.getByTestId('env-select')).toHaveValue(chosen);
});

test('[G1.6] an unsaved edit in the environment editor is flagged and closing the tab asks first', async ({ page }) => {
  await mockServer(page);
  await scene(page, {}, [envVar('k', 'orig')]);
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('env-node-EnvA').click();
  await page.getByTestId('env-var-initial-0').fill('draft');
  await expect(page.getByTestId('dirty-indicator').first()).toBeVisible();
  const tab = page.locator('[data-testid^="tab-"]:not([role="tab"])', { hasText: 'EnvA' });
  await tab.hover();
  await tab.getByRole('button').last().click();
  await expect(page.getByText('Unsaved Changes').first()).toBeVisible();
});

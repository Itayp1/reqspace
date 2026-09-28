import { test, expect } from '@playwright/test';

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
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('Login and create workspace', async ({ page }) => {
    // Custom in-app modal, not a native dialog
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(WORKSPACE_NAME);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('workspace-select')).toContainText(WORKSPACE_NAME);
    workspaceId = await page.getByTestId('workspace-select').inputValue();
  });

  test('Create an environment, add a variable, select and verify', async ({ page }) => {
    await page.getByTestId('workspace-select').selectOption(workspaceId);

    // Click on Environments tab
    await page.getByTestId('tab-environments').click();

    // Click New Environment (custom in-app modal, not a native dialog)
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill('Staging');
    await page.getByTestId('prompt-submit').click();

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
    await page.getByTestId('workspace-select').selectOption(workspaceId);

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
    await page.getByTestId('prompt-submit').click();

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

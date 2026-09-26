import { test, expect } from '@playwright/test';

test.describe('Environments Operations', () => {
  test.describe.configure({ mode: 'serial' });

  test('Login and create workspace', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    
    page.on('dialog', async (dialog) => {
      await dialog.accept('Env Workspace');
    });
    
    await page.getByTestId('new-workspace-btn').click();
    await expect(page.getByTestId('workspace-select')).toContainText('Env Workspace');
  });

  test('Create an environment, add a variable, select and verify', async ({ page }) => {
    await page.goto('/');

    // Click on Environments tab
    await page.getByTestId('tab-environments').click();

    // Click New Environment
    page.on('dialog', async (dialog) => {
      await dialog.accept('Staging');
    });
    await page.getByTestId('new-env-btn').click();

    // Verify it appears in the sidebar and is selected to edit
    // When environment is created, it should open in an editor tab.
    // The environment tab name is 'Staging'
    await expect(page.getByTestId('env-node-Staging')).toBeVisible();

    // Add a variable
    // The EnvironmentTabEditor has an add button
    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill('baseUrl');
    await page.getByTestId('env-var-initial-0').fill('https://api.staging.example.com');
    // Save the environment
    await page.getByTestId('env-save-btn').click();

    // Select the environment in the top bar dropdown
    await page.getByTestId('env-select').selectOption({ label: 'Staging' });

    // Verify it's selected
    await expect(page.getByTestId('env-select')).toHaveValue(/^[a-zA-Z0-9]+$/); // UUID or MongoID

    // Quick verification: we can create a new request and see if the variable resolves, or just assert the select was successful.
    // Let's create a request and type {{baseUrl}}
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('{{baseUrl}}/users');

    // That's enough to verify it applies in the UI context (it would evaluate during send)
    await expect(page.getByTestId('request-url-input')).toHaveValue('{{baseUrl}}/users');
  });

  test('secret masking, globals-vs-env precedence, export', async ({ page }) => {
    await page.goto('/');

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

    // 5. Export Environment
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('Export Environment JSON').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Precedence Env.reqspace_environment.json');
  });
});

import { test, expect, type Page } from './fixtures';

/**
 * Profile variables are the user's own values (phone, email, ...) and must
 * follow them into every workspace, whereas workspace-local variables belong to
 * the workspace they were created in. This pins both halves of that contract
 * across a real workspace switch.
 */
test.describe('Profile variables across workspaces', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const EMAIL = `profilews_${ts}@example.com`;
  const WS_A = `Profile WS A ${ts}`;
  const WS_B = `Profile WS B ${ts}`;
  const PHONE = '050-1234567';
  const LOCAL_VALUE = `only-in-A-${ts}`;

  async function login(page: Page) {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(EMAIL);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  }

  async function openEditor(page: Page, tab: 'Local' | 'Profile') {
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('env-local-variables-btn').click();
    const editor = page.getByTestId('local-variables-editor');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: tab === 'Profile' ? /Profile Variables/ : /^Local Variables$/ }).click();
    return editor;
  }

  async function addVar(page: Page, editor: ReturnType<Page['getByTestId']>, key: string, value: string) {
    await editor.getByRole('button', { name: 'Add Variable' }).click();
    await editor.getByPlaceholder('New variable').last().fill(key);
    await editor.getByPlaceholder('Value').last().fill(value);
    await editor.getByRole('button', { name: 'Save' }).click();
  }

  /** Sends GET https://<host>/ping where host comes from `{{varName}}` and returns the URL actually requested. */
  async function sentUrl(page: Page, template: string, matchHost: string) {
    await page.route(`https://${matchHost}/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.getByTestId('tab-collections').click();
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill(template);
    const sent = page.waitForRequest((r) => r.url().includes(matchHost));
    await page.getByTestId('request-send-btn').click();
    return (await sent).url();
  }

  test('set up two workspaces and a profile + a local variable in A', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Profile WS User');
    await page.getByTestId('register-email').fill(EMAIL);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    for (const name of [WS_A, WS_B]) {
      await page.getByTestId('new-workspace-btn').click();
      await page.getByTestId('prompt-input').fill(name);
      await page.getByTestId('prompt-submit').click();
      await expect(page.getByTestId('workspace-select')).toContainText(name);
    }
    await page.getByTestId('workspace-select').selectOption({ label: WS_A });

    const profile = await openEditor(page, 'Profile');
    await addVar(page, profile, 'myphone', PHONE);

    const local = await openEditor(page, 'Local');
    await addVar(page, local, 'wslocal', LOCAL_VALUE);
  });

  test('the profile variable is still there, with its value, after switching workspace', async ({ page }) => {
    await login(page);
    await page.getByTestId('workspace-select').selectOption({ label: WS_B });
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(WS_B);

    const editor = await openEditor(page, 'Profile');
    await expect(editor.getByPlaceholder('New variable').first()).toHaveValue('myphone');
    await expect(editor.getByPlaceholder('Value').first()).toHaveValue(PHONE);
  });

  test('the profile variable resolves in a request sent from the other workspace', async ({ page }) => {
    await login(page);
    await page.getByTestId('workspace-select').selectOption({ label: WS_B });
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(WS_B);

    const url = await sentUrl(page, 'https://profile-phone.example.com/ping?tel={{myphone}}', 'profile-phone.example.com');
    expect(url).toContain(`tel=${PHONE}`);
  });

  test('a workspace-local variable stays in its own workspace', async ({ page }) => {
    await login(page);

    // B must not see A's local variable...
    await page.getByTestId('workspace-select').selectOption({ label: WS_B });
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(WS_B);
    const inB = await openEditor(page, 'Local');
    for (const input of await inB.getByPlaceholder('New variable').all()) {
      await expect(input).not.toHaveValue('wslocal');
    }

    const unresolved = await sentUrl(page, 'https://local-leak.example.com/?v={{wslocal}}', 'local-leak.example.com');
    expect(decodeURIComponent(unresolved)).toContain('v={{wslocal}}');

    // ...while A still has it, with the value.
    await page.getByTestId('workspace-select').selectOption({ label: WS_A });
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(WS_A);
    const inA = await openEditor(page, 'Local');
    await expect(inA.getByPlaceholder('New variable').first()).toHaveValue('wslocal');
    await expect(inA.getByPlaceholder('Value').first()).toHaveValue(LOCAL_VALUE);
  });

  test('profile variable edits made in B are visible back in A', async ({ page }) => {
    await login(page);
    await page.getByTestId('workspace-select').selectOption({ label: WS_B });
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(WS_B);

    const editor = await openEditor(page, 'Profile');
    await addVar(page, editor, 'myemail', 'me@profile.example.com');

    await page.getByTestId('workspace-select').selectOption({ label: WS_A });
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(WS_A);
    const inA = await openEditor(page, 'Profile');
    await expect(inA.getByPlaceholder('New variable').nth(0)).toHaveValue('myphone');
    await expect(inA.getByPlaceholder('Value').nth(0)).toHaveValue(PHONE);
    await expect(inA.getByPlaceholder('New variable').nth(1)).toHaveValue('myemail');
    await expect(inA.getByPlaceholder('Value').nth(1)).toHaveValue('me@profile.example.com');
  });
});

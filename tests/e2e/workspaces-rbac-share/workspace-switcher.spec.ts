import { test, expect } from '../fixtures';
import { registerUser, apiAs, activeWorkspaceId } from '../helpers';
import { makeUser, makeWorkspace, createLink } from './invite-helpers';

/** The sidebar workspace switcher is a searchable combobox, not a native select. */
test('workspace picker filters by typing and switches workspace on pick', async ({ page }) => {
  const email = await registerUser(page, 'wspick');
  const ts = Date.now();
  const api = await apiAs(email);
  const alpha = (await (await api.post('/api/workspaces', { data: { name: `Alpha ${ts}` } })).json())._id;
  const beta = (await (await api.post('/api/workspaces', { data: { name: `Beta ${ts}` } })).json())._id;
  await page.reload();

  const trigger = page.getByTestId('workspace-select');
  await expect(trigger).toHaveAttribute('role', 'combobox');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const options = page.getByRole('listbox', { name: 'Workspaces' }).getByRole('option');
  // Other specs leave public workspaces visible to everyone, so only our own are asserted.
  await expect(options.filter({ hasText: String(ts) })).toHaveCount(2);

  await page.getByTestId('workspace-search').fill(`beta ${ts}`);
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveText(`Beta ${ts}`);

  await page.getByTestId('workspace-search').press('Enter');
  await expect(trigger).toHaveText(`Beta ${ts}`);
  expect(await activeWorkspaceId(page)).toBe(beta);
  await expect(page.getByRole('listbox')).toHaveCount(0);

  // Mouse pick + Escape + click-outside close.
  await trigger.click();
  await page.getByTestId(`workspace-option-${alpha}`).click();
  await expect(trigger).toHaveText(`Alpha ${ts}`);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await trigger.click();
  await page.mouse.click(600, 400);
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await expect(page.getByTestId('workspace-settings-btn')).toHaveAccessibleName('Workspace settings');
});

test.describe('invite links UI', () => {
  // same allowance the invite-link specs carry; this test provokes no 4xx on purpose
  test.use({ allowFpErrors: [/server-auth|status code 40[13]/] });

  test('"Join with Invite Link" in the workspace picker accepts a pasted link', async ({ page }) => {
    const owner = await makeUser('pick_owner');
    const ws = await makeWorkspace(owner.ctx, 'Picker Target');
    const { token } = await createLink(owner.ctx, ws, { role: 'viewer', singleUse: true });
    await registerUser(page, 'pick_joiner');

    await page.getByTestId('workspace-select').click();
    await page.getByTestId('workspace-join-link-btn').click();
    await page.getByTestId('join-link-submit-btn').click();
    await expect(page.getByTestId('join-link-error')).toHaveText('Paste an invite link or code.');
    await page.getByTestId('join-link-input').fill('hello world');
    await page.getByTestId('join-link-submit-btn').click();
    await expect(page.getByTestId('join-link-error')).toContainText('does not look like an invite link');

    await page.getByTestId('join-link-input').fill(`  http://localhost/invite/${token}?x=1  `);
    await page.getByTestId('join-link-submit-btn').click();
    await expect(page.getByTestId('invite-title')).toContainText('as Viewer');
    await page.getByTestId('invite-join-btn').click();
    await expect(page.getByTestId('workspace-select')).toHaveAttribute('data-value', ws);
  });
});

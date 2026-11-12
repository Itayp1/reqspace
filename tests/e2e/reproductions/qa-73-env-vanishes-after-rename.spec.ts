import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// QA-73: an environment added while a Rename prompt is open vanished from the list, because the
// handler wrote back the list it captured before the prompt.
test('QA-73: env created while the Rename prompt is open stays in the list', async ({ page }) => {
  await registerUser(page, 'qa73');
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('new-env-btn').click();
  await page.getByTestId('prompt-input').fill('Env One');
  await page.getByTestId('prompt-submit').click();
  await expect(page.getByTestId('env-node-Env One')).toBeVisible();

  await page.getByTestId('env-node-Env One').click({ button: 'right' });
  await page.getByTestId('context-menu-item').filter({ hasText: 'Rename' }).click();
  await expect(page.getByTestId('prompt-input')).toBeVisible();

  // Another client adds an env; the socket pushes it into the list while the prompt is open.
  await page.evaluate(async () => {
    const ws = (await (await fetch('/api/workspaces')).json())[0];
    await fetch(`/api/workspaces/${ws._id ?? ws.id}/environments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Env Two', variables: [] }),
    });
  });
  await expect(page.getByTestId('env-node-Env Two')).toBeVisible();

  await page.getByTestId('prompt-input').fill('Env One Renamed');
  await page.getByTestId('prompt-submit').click();
  await expect(page.getByTestId('env-node-Env One Renamed')).toBeVisible();
  await expect(page.getByTestId('env-node-Env Two')).toBeVisible();
});

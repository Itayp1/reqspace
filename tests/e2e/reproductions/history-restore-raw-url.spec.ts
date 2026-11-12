import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/**
 * QA-64/QA-40/QA-99: a history entry stored only the resolved URL, so restoring it (or "Save to
 * Collection" from history) persisted `http://host/...` instead of `{{baseUrl}}/...`.
 * QA-68: the restored tab was named by the URL.
 */
test('history restore keeps {{baseUrl}} and names the tab after the request', async ({ page }) => {
  // The dev server only accepts the Origin of the default client port (5173).
  await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
  await registerUser(page, 'hist_raw');
  await page.route('http://qa-host.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));

  const ws = (await (await page.request.get('/api/workspaces')).json())[0]._id;
  const col = await (await page.request.post(`/api/workspaces/${ws}/collections`, {
    data: { name: 'Raw Col', variables: [{ key: 'baseUrl', value: 'http://qa-host.example.test', enabled: true }] },
  })).json();
  await page.request.post(`/api/collections/${col._id}/requests`, {
    data: { name: 'List Users', method: 'GET', url: '{{baseUrl}}/users' },
  });
  await page.reload();

  await page.getByTestId('node-Raw Col').click();
  await page.getByTestId('node-List Users').click();
  const saved = page.waitForResponse((r) => /\/history$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByTestId('request-send-btn').click();
  await saved;

  await page.getByTestId('tab-history').click();
  await page.getByTestId('history-item').first().click();

  await expect(page.getByTestId('request-url-input')).toHaveValue('{{baseUrl}}/users');
  await expect(page.locator('[data-testid^="tab-"]').filter({ hasText: 'List Users' }).last()).toBeVisible();
  await expect(page.locator('[data-testid^="tab-"]').filter({ hasText: 'qa-host.example.test' })).toHaveCount(0);
});

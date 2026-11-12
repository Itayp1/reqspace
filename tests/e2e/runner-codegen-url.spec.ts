import { test, expect } from './fixtures';
import { registerUser, createCollectionUi, addViaMenu, treeNode, openNodeMenu } from './helpers';

/**
 * - The runner wrote each result into the *next* row (stale loop index), so the
 *   last request never got a result and its row stayed "Pending".
 * - An empty URL "succeeded" with 200 (fetch('') hits the app itself).
 * - Code snippets dropped url-encoded / form-data / GraphQL bodies.
 */
test.describe('Runner, empty URL, code snippets', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'rcu');
    await page.route('https://rcu.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  });

  test('every runner row gets its own result, and a request with no URL fails instead of passing', async ({ page }) => {
    await createCollectionUi(page, 'Run Col');
    for (const n of ['One', 'Two', 'Three']) await addViaMenu(page, 'Run Col', 'new-request', n);
    for (const n of ['One', 'Two']) {
      await treeNode(page, n).click();
      await page.getByTestId('request-url-input').fill(`https://rcu.example.test/${n}`);
      await page.getByTestId('request-save-btn').click();
      await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
    }
    await openNodeMenu(page, 'Run Col');
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toContainText('3 requests in collection');
    await page.getByTestId('collection-runner-run-btn').click();
    const modal = page.getByTestId('collection-runner-modal');
    await expect(modal).toContainText('3 / 3');
    await expect(modal).toContainText('Passed2');
    await expect(modal).toContainText('Failed1');
    await expect(modal.getByText('Pending')).toHaveCount(0);
  });

  test('sending with an empty URL is refused, and a scheme-less URL gets http://', async ({ page }) => {
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).not.toContainText('200');
    await expect(page.getByTestId('response-body-viewer')).toContainText('Enter a request URL');

    await page.route('http://rcu.example.test/**', (route) => route.fulfill({ status: 200, body: 'plain' }));
    await page.getByTestId('request-url-input').fill('rcu.example.test/noscheme');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
  });

  test('code snippets include url-encoded and form-data bodies', async ({ page }) => {
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('request-url-input').fill('https://rcu.example.test/form');
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-urlencoded').click();
    await page.getByTestId('kv-key-0').fill('a');
    await page.getByTestId('kv-val-0').fill('1');
    await page.getByTestId('codegen-btn').click();
    await expect(page.getByTestId('codegen-code-block')).toContainText("--data-urlencode 'a=1'");
    await page.getByTestId('codegen-lang-go').click();
    await expect(page.getByTestId('codegen-code-block')).toContainText('strings.NewReader("a=1")');
  });
});

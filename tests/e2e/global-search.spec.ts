import { test, expect } from '@playwright/test';

/**
 * Global search (Ctrl+K) had no coverage at all. The modal is built on real
 * ARIA roles (dialog / combobox / listbox / option), so this spec drives it
 * through those rather than adding test ids.
 *
 * Note on setup: the modal searches `useLoadedTree()`, which only contains
 * folders and requests belonging to collections the sidebar has already
 * expanded (and therefore loaded). The collection is expanded on purpose
 * before searching — an un-expanded collection's children are genuinely not
 * searchable today.
 */
test.describe('Global Search', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const COLLECTION = `Search Collection ${ts}`;
  const FOLDER = `Search Folder ${ts}`;
  const REQUEST = `Findable Request ${ts}`;
  const OTHER_REQUEST = `Ignored Request ${ts}`;
  const UNIQUE_URL = `https://unique-${ts}.example.com/needle`;

  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Search User');
    await page.getByTestId('register-email').fill(`search_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    // Registering twice with the same address fails on the second test, so
    // fall back to logging the same user in.
    if (!(await page.getByTestId('workspace-select').isVisible({ timeout: 5000 }).catch(() => false))) {
      await page.goto('/login');
      await page.getByTestId('login-email').fill(`search_${ts}@example.com`);
      await page.getByTestId('login-password').fill('password123');
      await page.getByTestId('login-submit').click();
    }
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  });

  test('builds a searchable tree', async ({ page }) => {
    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill(COLLECTION);
    await page.getByTestId('prompt-submit').click();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${COLLECTION}`) });
    await expect(colNode).toBeVisible();

    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-folder').click();
    await page.getByTestId('prompt-input').fill(FOLDER);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId(`node-${FOLDER}`)).toBeVisible();

    for (const name of [REQUEST, OTHER_REQUEST]) {
      await colNode.hover();
      await colNode.getByTestId('action-menu-btn').click();
      await page.getByTestId('action-menu-new-request').click();
      await page.getByTestId('prompt-input').fill(name);
      await page.getByTestId('prompt-submit').click();
      await expect(page.getByTestId(`node-${name}`)).toBeVisible();
    }

    // Give the "findable" request a URL nothing else shares, so the
    // search-by-URL assertion below can't match anything incidentally.
    await page.getByTestId(`node-${REQUEST}`).click();
    await page.getByTestId('request-url-input').fill(UNIQUE_URL);
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();
  });

  test('Ctrl+K finds collections, folders and requests by name', async ({ page }) => {
    const colRow = page.getByTestId(`node-${COLLECTION}`);
    await expect(colRow).toBeVisible();
    await colRow.click(); // expand so the collection's children get loaded
    await expect(page.getByTestId(`node-${REQUEST}`)).toBeVisible();

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await expect(dialog).toBeVisible();

    // One query that matches all three node types — they are listed
    // collections first, then folders, then requests.
    await dialog.getByRole('combobox').fill(`Search`);
    await expect(dialog.getByRole('option', { name: `collection: ${COLLECTION}` })).toBeVisible();
    await expect(dialog.getByRole('option', { name: `folder: ${FOLDER}` })).toBeVisible();

    await dialog.getByRole('combobox').fill('Findable');
    const options = dialog.getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveAttribute('aria-label', new RegExp(`^request: ${REQUEST}`));
  });

  test('matches a request by its URL, not only its name', async ({ page }) => {
    await page.getByTestId(`node-${COLLECTION}`).click();
    await expect(page.getByTestId(`node-${REQUEST}`)).toBeVisible();

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await dialog.getByRole('combobox').fill(`unique-${ts}`);

    const options = dialog.getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(UNIQUE_URL);
  });

  test('arrow keys move the selection and Enter opens the request', async ({ page }) => {
    await page.getByTestId(`node-${COLLECTION}`).click();
    await expect(page.getByTestId(`node-${REQUEST}`)).toBeVisible();

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await dialog.getByRole('combobox').fill(`Request ${ts}`);

    // Both requests match; nothing is selected until the first ArrowDown.
    const options = dialog.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

    // ArrowUp wraps back, and past the top it wraps round to the last item.
    await page.keyboard.press('ArrowUp');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

    // Narrow to one result and open it with Enter.
    await dialog.getByRole('combobox').fill('Findable');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('request-url-input')).toHaveValue(UNIQUE_URL);
  });

  test('clicking a result opens it; a miss says so; Escape closes', async ({ page }) => {
    await page.getByTestId(`node-${COLLECTION}`).click();
    await expect(page.getByTestId(`node-${REQUEST}`)).toBeVisible();

    // The toolbar button is the other way in, alongside the shortcut.
    await page.getByLabel('Global search (Ctrl+K)').click();
    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('combobox').fill('no-such-thing-anywhere');
    await expect(dialog.getByText('No results found for "no-such-thing-anywhere"')).toBeVisible();
    await expect(dialog.getByRole('option')).toHaveCount(0);

    await dialog.getByRole('combobox').fill('Findable');
    await dialog.getByRole('option').first().click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('request-url-input')).toHaveValue(UNIQUE_URL);

    // Reopen and dismiss with Escape — the request tab stays as it was.
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('request-url-input')).toHaveValue(UNIQUE_URL);
  });
});

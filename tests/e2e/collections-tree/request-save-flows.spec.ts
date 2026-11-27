import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu, openNodeMenu, startNewRequest, expectToast } from '../helpers';

// QA-02: a request created from the collection menu was not opened, so the editor kept the previous draft.
test('QA-02: a request created from the collection menu opens in the editor', async ({ page }) => {
  await registerUser(page, 'qa02');
  await createCollectionUi(page, 'Col');
  await page.getByTestId('new-tab-btn').click(); // an unrelated draft is on screen

  await startNewRequest(page, 'Col');
  await page.getByTestId('prompt-input').fill('Get Users');
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && /\/collections\/[^/]+\/requests$/.test(r.url()));
  await page.getByTestId('prompt-input').press('Enter');
  const id = (await (await created).json())._id;

  // Whatever is typed now must land on the new request, not on the old draft.
  await page.getByTestId('request-url-input').fill('https://example.test/users');
  await page.getByTestId('request-save-btn').click();
  await expect.poll(async () => (await (await page.request.get(`/api/requests/${id}`)).json()).url).toBe('https://example.test/users');
});

// QA-14 / QA-60: saving a request must confirm with a toast, like Local Variables and environments do.
test('QA-14: saving a request shows a success toast', async ({ page }) => {
  await registerUser(page, 'qa14r');
  await createCollectionUi(page, 'SaveCol');
  await addViaMenu(page, 'SaveCol', 'new-request', 'SaveReq');
  await page.getByTestId('request-url-input').fill('https://example.test/saved');
  await page.getByTestId('request-save-btn').click();
  await expectToast(page, 'success', 'Request saved');
});

// QA-77: the Save dialog of a duplicated tab must default to the original request's collection, not the first one.
test('QA-77: Duplicate Tab then Save defaults to the original collection', async ({ page }) => {
  await registerUser(page, 'qa77');
  await createCollectionUi(page, 'FirstCol');
  await createCollectionUi(page, 'HomeCol');
  await addViaMenu(page, 'HomeCol', 'new-request', 'HomeReq');
  await page.getByTestId('request-url-input').fill('https://example.test/home');
  await page.getByTestId('request-save-btn').click();

  await page.locator('[data-testid^="tab-"]').filter({ hasText: 'HomeReq' }).first().click({ button: 'right' });
  await page.getByTestId('tab-menu-duplicate').click();
  await page.getByTestId('request-save-btn').click();

  const row = (n: string) => page.getByTestId('save-req-submit-btn').locator('xpath=ancestor::form').getByRole('button', { name: n });
  await expect(row('HomeCol')).toHaveClass(/bg-primary/);
  await expect(row('FirstCol')).not.toHaveClass(/bg-primary/);
});

// QA-64b: every Duplicate path must keep the raw {{baseUrl}} URL, never a resolved one.
test('QA-64b: tree Duplicate and Duplicate Tab keep {{baseUrl}}', async ({ page }) => {
  await registerUser(page, 'qa64b');
  await createCollectionUi(page, 'RawCol');
  await addViaMenu(page, 'RawCol', 'new-request', 'RawReq');
  const raw = '{{baseUrl}}/api/x';
  await page.getByTestId('request-url-input').fill(raw);
  await page.getByTestId('request-save-btn').click();

  await openNodeMenu(page, 'RawReq');
  await page.getByText('Duplicate', { exact: true }).click();
  await page.getByTestId('node-RawReq (Copy)').click();
  await expect(page.getByTestId('request-url-input')).toHaveValue(raw);

  await page.locator('[data-testid^="tab-"]').filter({ hasText: 'RawReq (Copy)' }).first().click({ button: 'right' });
  await page.getByTestId('tab-menu-duplicate').click();
  await expect(page.getByTestId('request-url-input')).toHaveValue(raw);
});

/**
 * The Save split-button's dropdown ("Save" / "Save As...") and the Save
 * modal's own "New Collection" / "New Folder" shortcuts were unreferenced by
 * any test. requests.spec.ts only ever exercises the plain Save button
 * against a collection the sidebar created first.
 */
test.describe('Save As & in-modal creation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Save User');
    await page.getByTestId('register-email').fill(`saveas_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('a brand-new request can create its collection and folder from the Save modal', async ({ page }) => {
    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('request-url-input').fill('https://example.com/from-modal');

    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Modal Created Request');

    // With no collections yet the modal can't save — the submit button stays
    // disabled until a location exists and is selected.
    await expect(page.getByTestId('save-req-submit-btn')).toBeDisabled();

    await page.getByTestId('save-req-new-collection').click();
    await page.getByTestId('save-req-new-name').fill('Modal Collection');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Creating a collection selects it, which enables both submit and the
    // New Folder button (that one needs a selected parent).
    await expect(page.getByTestId('save-req-submit-btn')).toBeEnabled();
    await expect(page.getByTestId('save-req-new-folder')).toBeEnabled();

    await page.getByTestId('save-req-new-folder').click();
    await page.getByTestId('save-req-new-name').fill('Modal Folder');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('save-req-name-input')).toBeHidden();

    // Saving opens the collection but not the new folder, so the request is
    // only in view once the folder is expanded — which is also the proof it
    // was filed under the folder rather than at the collection root.
    await expect(page.getByTestId('node-Modal Collection')).toBeVisible();
    await expect(page.getByTestId('node-Modal Created Request')).toBeHidden();
    await page.getByTestId('node-Modal Folder').click();
    await expect(page.getByTestId('node-Modal Created Request')).toBeVisible();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();
  });

  test('Save in the dropdown saves in place; Save As... copies to a new name', async ({ page }) => {
    await page.getByTestId('new-collection-empty-btn').click();
    await page.getByTestId('prompt-input').fill('Save Target');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('node-Save Target')).toBeVisible();

    // With a collection present the empty state asks for a name and creates the saved request (QA-11).
    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('prompt-input').fill('Original');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('node-Original')).toBeVisible();
    await page.getByTestId('request-url-input').fill('https://example.com/original');
    await page.getByTestId('request-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);

    // The dropdown's "Save" is the same in-place save as the main button: an
    // already-saved request must not reopen the modal.
    await page.waitForTimeout(600); // past the undo-coalescing window
    await page.getByTestId('request-url-input').fill('https://example.com/edited');
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();

    await page.getByTestId('request-save-menu-btn').click();
    await page.getByTestId('save-menu-save').click();
    await expect(page.getByTestId('save-req-name-input')).toBeHidden();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    // "Save As..." always opens the modal, even for a saved, clean request.
    await page.getByTestId('request-save-menu-btn').click();
    await page.getByTestId('save-menu-save-as').click();
    await expect(page.getByTestId('save-req-name-input')).toBeVisible();
    await page.getByTestId('save-req-name-input').fill('Copy Of Original');
    await page.getByTestId('save-req-submit-btn').click();
    await expect(page.getByTestId('save-req-name-input')).toBeHidden();

    // Both exist afterwards — Save As creates, it doesn't rename.
    await expect(page.getByTestId('node-Original')).toBeVisible();
    await expect(page.getByTestId('node-Copy Of Original')).toBeVisible();

    // And the copy kept the edited URL.
    await page.reload();
    await page.getByTestId('node-Save Target').click();
    await page.getByTestId('node-Copy Of Original').click();
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://example.com/edited');
  });
});

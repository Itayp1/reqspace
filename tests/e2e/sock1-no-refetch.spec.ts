import { test, expect } from '@playwright/test';

// SOCK-1: a socket event must mutate the observer's store in place — no
// HTTP. Before this task, SocketSync.tsx's handleUpdate refetched the whole
// tree (fetchCollectionsData) on every structural event; renaming a single
// collection cost every other viewer a full 1+2N request storm (PERF-1).
test('a rename from another user updates the sidebar with zero HTTP requests', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const timestamp = Date.now();
  const emailA = `sockA_${timestamp}@example.com`;
  const emailB = `sockB_${timestamp}@example.com`;
  const password = 'password123';

  await pageA.goto('/register');
  await pageA.getByTestId('register-name').fill('Sock A');
  await pageA.getByTestId('register-email').fill(emailA);
  await pageA.getByTestId('register-password').fill(password);
  await pageA.getByTestId('register-submit').click();
  await expect(pageA).toHaveURL(/.*\/$/);

  await pageB.goto('/register');
  await pageB.getByTestId('register-name').fill('Sock B');
  await pageB.getByTestId('register-email').fill(emailB);
  await pageB.getByTestId('register-password').fill(password);
  await pageB.getByTestId('register-submit').click();
  await expect(pageB).toHaveURL(/.*\/$/);

  const wsName = `Sock WS ${timestamp}`;
  await pageA.getByTestId('new-workspace-btn').click();
  await pageA.getByTestId('prompt-input').fill(wsName);
  await pageA.getByTestId('prompt-submit').click();
  await expect(pageA.getByTestId('workspace-select')).toContainText(wsName);

  await pageA.getByTestId('new-collection-empty-btn').click();
  await pageA.getByTestId('prompt-input').fill('Sock Collection');
  await pageA.getByTestId('prompt-submit').click();
  await expect(pageA.getByTestId('node-Sock Collection')).toBeVisible();

  await pageA.getByTestId('workspace-settings-btn').click();
  await pageA.getByTestId('workspace-members-tab').click();
  await pageA.getByTestId('user-autocomplete-input').fill('Sock B');
  await pageA.getByTestId('user-autocomplete-result').first().click();
  await pageA.getByTestId('workspace-invite-btn').click();
  await expect(pageA.getByTestId('member-email').filter({ hasText: emailB })).toBeVisible();
  await pageA.getByTestId('close-workspace-modal').click();

  await pageB.reload();
  await expect(pageB.getByTestId('workspace-select')).toContainText(wsName);
  // FIX-9: fetchCollectionsData applies whichever response lands last with
  // no staleness guard. Switching workspace before the mount effect's fetch
  // for B's own default workspace has settled lets the two race, and the
  // default's (empty) result can win and clobber "Sock WS"'s data. Wait for
  // the mount fetch to settle first so only one fetch is ever in flight.
  await expect(pageB.getByText(/no collections yet/i).or(pageB.getByTestId('node-container').first())).toBeVisible();
  await pageB.getByTestId('workspace-select').selectOption({ label: wsName });
  await expect(pageB.getByTestId('node-Sock Collection')).toBeVisible();
  // The workspace switch's own fetchCollectionsData issues per-collection
  // folder/request fetches after the collections list itself resolves (and
  // React StrictMode double-invokes the effect in dev) — wait for that to
  // fully settle before counting, or this test would flag its own initial
  // load, not a socket-triggered refetch.
  await pageB.waitForLoadState('networkidle');

  // Only start counting once B has finished loading the workspace it just
  // switched into — everything before this point is legitimate initial-load
  // traffic, not what this test is about.
  const requestsAfterLoad: string[] = [];
  pageB.on('request', (req) => {
    const url = req.url();
    if (req.method() === 'GET' && (/\/collections(\?|$)/.test(url) || /\/collections\/[^/]+\/(folders|requests)$/.test(url) || /\/workspaces\/[^/]+\/tree$/.test(url))) {
      requestsAfterLoad.push(`${req.method()} ${url}`);
    }
  });

  await pageA.getByTestId('node-Sock Collection').dblclick();
  await pageA.getByTestId('inline-rename-input').fill('Renamed Sock Collection');
  await pageA.keyboard.press('Enter');

  await expect(pageB.getByTestId('node-Renamed Sock Collection')).toBeVisible({ timeout: 15000 });

  expect(requestsAfterLoad).toEqual([]);

  await contextA.close();
  await contextB.close();
});

import { test, expect } from "@playwright/test";

test.describe("History Logging", () => {
  test.describe.configure({ mode: "serial" });
  const timestamp = Date.now();
  const testEmail = `history_${timestamp}@example.com`;
  const testPassword = "password123";
  let workspaceId = "";

  test.beforeAll(async ({ request }) => {
    // Fast API-based register, ahead of every test's UI login below.
    await request.post("/api/auth/register", {
      data: { name: "History User", email: testEmail, password: testPassword },
    });
  });

  test.beforeEach(async ({ page }) => {
    // Each test gets a fresh browser context — there's no session left over
    // from the previous test, so every test has to log in for itself.
    await page.goto("/login");
    await page.getByTestId("login-email").fill(testEmail);
    await page.getByTestId("login-password").fill(testPassword);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test("Request history is logged and replayable", async ({ page }) => {
    // Create Workspace (custom in-app modal, not a native dialog)
    const wsName = `Hist WS ${timestamp}`;
    await page.getByTestId("new-workspace-btn").click();
    await page.getByTestId("prompt-input").fill(wsName);
    await page.getByTestId("prompt-submit").click();
    await expect(page.getByTestId("workspace-select")).toContainText(wsName);
    workspaceId = await page.getByTestId("workspace-select").inputValue();

    // Create a request and send
    await page.getByTestId("new-tab-btn").click();
    await page.getByTestId("request-url-input").fill("https://httpbin.org/get");
    await page.getByTestId("request-send-btn").click();
    // Real HTTP/2 responses (as httpbin.org serves) have no reason phrase.
    await expect(page.getByTestId("response-status")).toContainText("200", { timeout: 15000 });

    // Change URL and send again to verify state
    await page.getByTestId("request-url-input").fill("https://httpbin.org/status/201");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("201", { timeout: 15000 });

    // Open History sidebar
    await page.getByTestId("tab-history").click();

    // Verify first request is in history
    const historyItems = page.locator('[data-testid="history-item"]');
    await expect(historyItems.first()).toBeVisible();
    await expect(
      page.locator('[data-testid="history-item"]:has-text("httpbin.org/get")'),
    ).toBeVisible();

    // Click the history item to restore it
    await page.click(
      '[data-testid="history-item"]:has-text("httpbin.org/get")',
    );

    // Verify the URL input now has the restored URL
    await expect(page.getByTestId("request-url-input")).toHaveValue(
      "https://httpbin.org/get",
    );
  });

  test("Search history", async ({ page }) => {
    await page.getByTestId("workspace-select").selectOption(workspaceId);
    await page.getByTestId("new-tab-btn").click();

    // Send a couple of requests
    await page.getByTestId("request-url-input").fill("https://httpbin.org/get?q=search1");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("200", { timeout: 15000 });

    await page.getByTestId("request-url-input").fill("https://httpbin.org/get?q=search2");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("200", { timeout: 15000 });

    // Open History sidebar
    await page.getByTestId("tab-history").click();

    // Search for search1
    await page.getByPlaceholder("Search history...").fill("search1");

    // Expect search1 to be visible
    await expect(
      page.locator('[data-testid="history-item"]:has-text("search1")'),
    ).toBeVisible();
    // Expect search2 to not be visible
    await expect(
      page.locator('[data-testid="history-item"]:has-text("search2")'),
    ).not.toBeVisible();
  });

  test("Save to Collection from History", async ({ page }) => {
    await page.getByTestId("workspace-select").selectOption(workspaceId);

    // Ensure we have a collection (custom in-app modal, not a native dialog)
    const newBtn = page.getByTestId("new-collection-empty-btn");
    if (await newBtn.isVisible()) {
      await newBtn.click();
    } else {
      await page.getByTestId("new-collection-btn").click();
    }
    await page.getByTestId("prompt-input").fill("History Collection");
    await page.getByTestId("prompt-submit").click();
    await expect(page.getByTestId("node-History Collection")).toBeVisible();

    // Open history
    await page.getByTestId("tab-history").click();

    // Clear search if any
    await page.getByPlaceholder("Search history...").fill("");

    // Hover and click Save on the first item
    const firstItem = page.locator('[data-testid="history-item"]').first();
    await firstItem.hover();
    await firstItem.locator('button[title="Save to Collection"]').click();

    await page.getByTestId("save-req-name-input").fill("Saved from History");
    const saveModal = page
      .getByTestId("save-req-name-input")
      .locator("xpath=ancestor::form");
    await saveModal.getByText("History Collection", { exact: true }).click();
    const saveSubmit = page.getByTestId("save-req-submit-btn");
    await expect(saveSubmit).toBeEnabled();
    await saveSubmit.click();

    // Verify it is saved in the collection sidebar. A fresh page load starts
    // every collection collapsed, so it has to be expanded first.
    await expect(page.getByTestId("save-req-name-input")).toBeHidden();
    await page.getByTestId("tab-collections").click();
    await expect(page.getByTestId("node-History Collection")).toBeVisible();
    // Save already opens the target collection. Clicking the row toggles it
    // shut, which hides the request that was just saved.
    await expect(page.getByTestId("node-Saved from History")).toBeVisible();
  });

  test("Quota behavior - large response bodies are truncated, not excluded", async ({ page }) => {
    // The server's history quota (server/src/routes/history.ts) truncates an
    // oversized response body to maxRequestBodyKB (default 10KB) and evicts
    // the OLDEST entries once the user's total exceeds maxTotalPerUserMB —
    // it never excludes the triggering request itself, so the history entry
    // for this URL is still expected to show up.
    await page.getByTestId("workspace-select").selectOption(workspaceId);
    await page.getByTestId("new-tab-btn").click();

    // Send a request that returns > 500KB (e.g. 600000 bytes)
    await page.getByTestId("request-url-input").fill("https://httpbin.org/bytes/600000");
    await page.getByTestId("request-send-btn").click();
    await expect(page.getByTestId("response-status")).toContainText("200", {
      timeout: 15000,
    });

    // Open history
    await page.getByTestId("tab-history").click();

    await expect(
      page.locator('[data-testid="history-item"]:has-text("600000")'),
    ).toBeVisible();
  });
});

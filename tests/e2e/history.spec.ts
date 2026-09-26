import { test, expect } from "@playwright/test";

test.describe("History Logging", () => {
  test.describe.configure({ mode: "serial" });
  const timestamp = Date.now();
  const testEmail = `history_${timestamp}@example.com`;

  test("Request history is logged and replayable", async ({ page }) => {
    // Register
    await page.goto("/register");
    await page.fill('[data-testid="register-name"]', "History User");
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', "password");
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/.*\/$/);

    // Create Workspace
    const wsName = `Hist WS ${timestamp}`;
    page.on("dialog", (dialog) => dialog.accept(wsName));
    await page.click('[data-testid="new-workspace-btn"]');

    // Create a request and send
    await page.getByTestId("request-url-input").fill("https://httpbin.org/get");
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId("response-status")).toContainText("200 OK");

    // Change URL and send again to verify state
    await page
      .getByTestId("request-url-input")
      .fill("https://httpbin.org/status/201");
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId("response-status")).toContainText(
      "201 CREATED",
    );

    // Open History sidebar
    await page.click('[data-testid="tab-history"]');

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
    await page.goto("/");

    // Send a couple of requests
    await page
      .getByTestId("request-url-input")
      .fill("https://httpbin.org/get?q=search1");
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId("response-status")).toContainText("200 OK");

    await page
      .getByTestId("request-url-input")
      .fill("https://httpbin.org/get?q=search2");
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId("response-status")).toContainText("200 OK");

    // Open History sidebar
    await page.click('[data-testid="tab-history"]');

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
    await page.goto("/");

    // Ensure we have a collection
    const newBtn = page.getByTestId("new-collection-empty-btn");
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.getByTestId("prompt-input").fill("History Collection");
      await page.getByTestId("prompt-submit").click();
    } else {
      await page.getByTestId("new-collection-btn").click();
      await page.getByTestId("prompt-input").fill("History Collection");
      await page.getByTestId("prompt-submit").click();
    }

    // Open history
    await page.click('[data-testid="tab-history"]');

    // Clear search if any
    await page.getByPlaceholder("Search history...").fill("");

    // Hover and click Save on the first item
    const firstItem = page.locator('[data-testid="history-item"]').first();
    await firstItem.hover();
    await firstItem.locator('button[title="Save to Collection"]').click();

    await page.getByTestId("save-req-name-input").fill("Saved from History");
    await page.getByTestId("save-req-submit-btn").click();

    // Verify it is saved in the collection sidebar
    await page.click('[data-testid="tab-collections"]');
    await expect(page.getByTestId("node-Saved from History")).toBeVisible();
  });

  test("Quota behavior - large requests are not saved", async ({ page }) => {
    await page.goto("/");

    // Send a request that returns > 500KB (e.g. 600000 bytes)
    await page
      .getByTestId("request-url-input")
      .fill("https://httpbin.org/bytes/600000");
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId("response-status")).toContainText("200 OK", {
      timeout: 15000,
    });

    // Open history
    await page.click('[data-testid="tab-history"]');

    // It should not be in the history list (quota limits it from saving)
    await expect(
      page.locator('[data-testid="history-item"]:has-text("600000")'),
    ).not.toBeVisible();
  });
});

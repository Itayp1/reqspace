const fs = require('fs');
let text = fs.readFileSync('tests/features-part2.spec.ts', 'utf-8');

const newTest = `
  test('Inline Comments', async ({ page }) => {
    // Need a request to comment on.
    await page.locator('button[title="New Request"]').click();
    await page.fill('input[placeholder="My Request"]', 'Comment Test Request');
    await page.click('button:has-text("Create")');
    
    // Open comments tab
    await page.click('button:has-text("Comments")');
    await expect(page.locator('text=No comments yet')).toBeVisible();

    // Add a comment
    await page.fill('input[placeholder="Add a comment..."]', 'This is a test comment');
    await page.keyboard.press('Enter');

    // Wait for comment to appear
    await expect(page.locator('text=This is a test comment')).toBeVisible({ timeout: 5000 });

    // Delete comment
    await page.hover('text=This is a test comment');
    await page.locator('button[title="Delete comment"]').click();
    await expect(page.locator('text=No comments yet')).toBeVisible({ timeout: 5000 });
  });
`;

text = text.replace(/test\('Raw HTTP Import'/g, newTest + "\n  test('Raw HTTP Import'");
fs.writeFileSync('tests/features-part2.spec.ts', text);

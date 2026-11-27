import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test('unresolved variable is not error-red: dashed underline plus tooltip', async ({ page }) => {
  await registerUser(page, 'requx');
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('request-url-input').fill('{{nope}}/x');
  const span = page.locator('span', { hasText: '{{nope}}' }).first();
  await expect(span).toHaveClass(/decoration-dashed/);
  await expect(span).not.toHaveClass(/text-red-500/);
  await expect(page.getByTestId('request-url-input')).toHaveAttribute('title', /Undefined variable: nope/);
});

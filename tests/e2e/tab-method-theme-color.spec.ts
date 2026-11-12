import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('request tab method label uses the theme method token', async ({ page }) => {
  await registerUser(page, 'tab_method_color');
  await page.getByTestId('new-tab-btn').click();
  const label = page.locator('[data-testid^="tab-"]').filter({ has: page.getByTestId('close-tab-btn') }).first().getByText('GET', { exact: true });
  const [actual, token] = await Promise.all([
    label.evaluate(el => getComputedStyle(el).color),
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-get)';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }),
  ]);
  expect(actual).toBe(token);
});

import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';
import { mockServer, scene, envVar } from '../scene';

test.describe('Variable resolution on send', () => {
  test('[G1.1] {{var}} from the selected environment resolves in URL, header, raw body and bearer auth', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, {
      method: 'POST',
      url: 'https://mock.test/x?h={{hostv}}',
      headers: [{ key: 'X-H', value: '{{hostv}}', enabled: true }],
      body: { mode: 'raw', raw: 'b={{hostv}}', rawLanguage: 'text' },
      auth: { type: 'bearer', bearer: { token: '{{hostv}}' } },
    }, [envVar('hostv', 'v-one')]);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    const s = seen.at(-1)!;
    expect(s.url).toContain('h=v-one');
    expect(s.headers['x-h']).toBe('v-one');
    expect(s.body).toBe('b=v-one');
    expect(s.headers['authorization']).toBe('Bearer v-one');
  });

  test('[G8.3] a dynamic variable inside an environment value is resolved on send', async ({ page }) => {
    const seen = await mockServer(page);
    await scene(page, { url: 'https://mock.test/x?u={{dyn}}' }, [envVar('dyn', 'envguid-{{$guid}}')]);
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    const u = decodeURIComponent(seen.at(-1)!.url);
    expect(u).toMatch(/u=envguid-[0-9a-f-]{36}/);
  });

  test('dynamic variables resolve to fresh values when the request is sent', async ({ page }) => {
    await registerUser(page, 'shell_dyn');
    const seen: string[] = [];
    await page.route('https://dyn.example.test/**', (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, body: 'ok' });
    });
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://dyn.example.test/item?id={{$guid}}&n={{$randomInt}}&t={{$timestamp}}');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]);
    expect(url.searchParams.get('id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(url.searchParams.get('n')).toMatch(/^\d+$/);
    expect(Number(url.searchParams.get('t'))).toBeGreaterThan(1_700_000_000);
  });
});

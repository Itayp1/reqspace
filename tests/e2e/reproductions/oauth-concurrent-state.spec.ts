import { test, expect } from '../fixtures';
import { startMockIdp, enableCustomProvider, disableCustomProvider, type MockIdp } from '../mock-idp';

/**
 * OAUTH1: starting a second sign-in (second click, second tab) overwrote the single oauth_state
 * cookie, so finishing the FIRST sign-in failed with "Invalid or expired OAuth state".
 */
let idp: MockIdp;
test.beforeAll(async () => {
  idp = await startMockIdp();
  await enableCustomProvider(idp);
});
test.afterAll(async () => {
  await disableCustomProvider();
  await idp.close();
});

test.describe('OAuth state is per sign-in attempt', () => {
  test('two sign-ins started in the same browser can both complete', async ({ page }) => {
    idp.mode = 'allow';
    idp.userinfo = { email: `oauth_state_${Date.now()}@example.com`, name: 'State', email_verified: true };

    const first = await (await page.request.get('/api/auth/state')).json();
    const second = await (await page.request.get('/api/auth/state')).json();
    expect(first.state).not.toBe(second.state);

    const redirectUri = `${new URL(page.url() === 'about:blank' ? (process.env.REQSPACE_WEB_URL as string) : page.url()).origin}/auth/custom/callback`;
    const a = await page.request.post('/api/auth/custom', { data: { code: 'good-code', state: first.state, redirectUri } });
    expect(a.status(), await a.text()).toBe(200);
    const b = await page.request.post('/api/auth/custom', { data: { code: 'good-code', state: second.state, redirectUri } });
    expect(b.status(), await b.text()).toBe(200);
  });

  test('the state endpoint is not cacheable', async ({ page }) => {
    const res = await page.request.get('/api/auth/state');
    expect(res.headers()['cache-control']).toContain('no-store');
  });
});

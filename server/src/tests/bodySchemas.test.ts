import { registerBody, proxyBody, collectionCreateBody, adminConfigBody, settingsBody } from '../validation/body';

describe('request body schemas', () => {
  test('register rejects a short password and strips unknown fields', () => {
    expect(registerBody.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success).toBe(false);
    const parsed = registerBody.parse({ name: 'A', email: 'a@b.co', password: 'long-enough', isSuperAdmin: true });
    expect(parsed).toEqual({ name: 'A', email: 'a@b.co', password: 'long-enough' });
  });

  test('proxy requires an http method and url', () => {
    expect(proxyBody.safeParse({ url: 'https://example.com' }).success).toBe(false);
    expect(proxyBody.safeParse({ method: 'GET', url: 'https://example.com' }).success).toBe(true);
  });

  test('collection create requires a name and drops workspaceId', () => {
    expect(collectionCreateBody.safeParse({ description: 'x' }).success).toBe(false);
    const parsed = collectionCreateBody.parse({ name: 'API', workspaceId: 'should-drop' });
    expect(parsed).toEqual({ name: 'API' });
  });

  test('settings and admin config drop fields that are not on the allowlist', () => {
    const settings = settingsBody.parse({ saveHistory: false, isSuperAdmin: true });
    expect(settings).toEqual({ saveHistory: false });
    const config = adminConfigBody.parse({ auth: { allowSelfRegistration: true }, config: { smtp: {} } });
    expect(config).toEqual({ auth: { allowSelfRegistration: true } });
  });
});

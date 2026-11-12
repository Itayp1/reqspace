import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { apiAsAdmin } from './helpers';

/**
 * A mock OAuth2 identity provider for the "custom" sign-in provider. The test decides the outcome:
 *   /authorize  redirects back with ?code=… (or ?error=access_denied when `mode` is 'deny')
 *   /token      accepts only the code it issued
 *   /userinfo   returns `userinfo`
 */
export interface MockIdp {
  url: string;
  mode: 'allow' | 'deny';
  userinfo: Record<string, unknown>;
  tokenRequests: URLSearchParams[];
  close(): Promise<void>;
}

export async function startMockIdp(): Promise<MockIdp> {
  const idp: MockIdp = { url: '', mode: 'allow', userinfo: {}, tokenRequests: [], close: async () => {} };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://idp');
    if (url.pathname === '/authorize') {
      const back = new URL(url.searchParams.get('redirect_uri')!);
      if (idp.mode === 'deny') back.searchParams.set('error', 'access_denied');
      else back.searchParams.set('code', 'good-code');
      back.searchParams.set('state', url.searchParams.get('state')!);
      res.writeHead(302, { Location: back.toString() }).end();
    } else if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const form = new URLSearchParams(body);
        idp.tokenRequests.push(form);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(form.get('code') === 'good-code' ? { access_token: 'tok-123' } : { error: 'invalid_grant' }));
      });
    } else if (url.pathname === '/userinfo') {
      const ok = req.headers.authorization === 'Bearer tok-123';
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ok ? idp.userinfo : { error: 'invalid_token' }));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  idp.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  idp.close = () => new Promise<void>((r) => server.close(() => r()));
  return idp;
}

/** Points the app's "custom" provider at the mock IdP (admin settings). */
export async function enableCustomProvider(idp: MockIdp, name = 'Acme SSO') {
  const admin = await apiAsAdmin();
  const res = await admin.put('/api/admin/config', {
    data: {
      auth: {
        allowSelfRegistration: true,
        customOAuth: {
          enabled: true, name, clientId: 'acme-client', clientSecret: 'acme-secret',
          authorizeUrl: `${idp.url}/authorize`, tokenUrl: `${idp.url}/token`, userinfoUrl: `${idp.url}/userinfo`,
        },
      },
    },
  });
  if (!res.ok()) throw new Error(`enabling the custom provider answered ${res.status()}`);
}

export async function disableCustomProvider() {
  const admin = await apiAsAdmin();
  await admin.put('/api/admin/config', { data: { auth: { customOAuth: { enabled: false } } } });
}

import { describe, it, expect } from 'vitest';
import { applyRequestAuth, folderChainClosestFirst, resolveInheritedAuth } from './requestAuth';
import type { RequestAuth } from '../store/requestStore';

const bearer: RequestAuth = { type: 'bearer', bearer: { token: 'my-super-secret-token' } };
const basic: RequestAuth = { type: 'basic', basic: { username: 'admin', password: 'password123' } };

describe('applyRequestAuth', () => {
  it('sets a Bearer header and leaves the caller free to encode a body', () => {
    const applied = applyRequestAuth({ auth: bearer, headers: {}, url: 'http://localhost/echo' });
    expect(applied.headers.Authorization).toBe('Bearer my-super-secret-token');
    expect(applied.url).toBe('http://localhost/echo');
  });

  it('encodes Basic auth the same way the send path always has', () => {
    const applied = applyRequestAuth({ auth: basic, headers: {}, url: 'http://localhost/echo' });
    expect(applied.headers.Authorization).toBe('Basic YWRtaW46cGFzc3dvcmQxMjM=');
  });

  it('resolves variables inside the token', () => {
    const applied = applyRequestAuth({
      auth: { type: 'bearer', bearer: { token: '{{token}}' } },
      headers: {},
      url: 'http://localhost/echo',
      resolve: (value) => value.replace('{{token}}', 'from-env'),
    });
    expect(applied.headers.Authorization).toBe('Bearer from-env');
  });

  it('puts an API key on the query string when that is where it belongs', () => {
    const applied = applyRequestAuth({
      auth: { type: 'apikey', apikey: { key: 'api_key', value: 'secret', in: 'query' } },
      headers: { 'Content-Type': 'application/json' },
      url: 'http://localhost/echo',
    });
    expect(applied.headers.Authorization).toBeUndefined();
    expect(applied.headers['Content-Type']).toBe('application/json');
    expect(applied.url).toBe('http://localhost/echo?api_key=secret');
  });
});

describe('resolveInheritedAuth', () => {
  it('uses the closest folder, then its parent, then the collection', () => {
    const folders = folderChainClosestFirst('child', [
      { _id: 'root', parentFolderId: null, auth: bearer },
      { _id: 'child', parentFolderId: 'root', auth: { type: 'inherit' as const } },
    ]);
    expect(folders.map(f => f._id)).toEqual(['child', 'root']);
    expect(resolveInheritedAuth({ type: 'inherit' }, folders, { auth: basic })?.type).toBe('bearer');
  });

  it('falls through to the collection when every folder inherits', () => {
    const folders = [{ auth: { type: 'inherit' as const } }];
    expect(resolveInheritedAuth({ type: 'inherit' }, folders, { auth: basic })).toEqual(basic);
  });

  it('keeps an explicit request auth instead of walking parents', () => {
    expect(resolveInheritedAuth(basic, [{ auth: bearer }], { auth: bearer })).toEqual(basic);
  });
});

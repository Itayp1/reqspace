import { describe, it, expect, beforeEach } from 'vitest';
import { useCookieStore, cookiePathMatches, isCookieExpired } from './cookieStore';
import { normalizeRequestUrl } from '../transport';
import { toHeaderSafeValue, getBrowserTransportWarnings } from '../transport/browser';
import { percentile, validateLoadTestConfig } from '../components/request/LoadTestModal';

const base = { domain: '127.0.0.1', value: 'v', path: '/', httpOnly: false, secure: false };

describe('cookie jar matching (D12.2/D12.3)', () => {
  beforeEach(() => useCookieStore.setState({ cookies: [] }));

  it('honors Path on a segment boundary', () => {
    expect(cookiePathMatches('/admin', '/admin')).toBe(true);
    expect(cookiePathMatches('/admin', '/admin/x')).toBe(true);
    expect(cookiePathMatches('/admin', '/administrator')).toBe(false);
    expect(cookiePathMatches('/admin', '/echo')).toBe(false);
    expect(cookiePathMatches('/', '/anything')).toBe(true);
  });

  it('filters by path, Secure and expiry in the Cookie header', () => {
    useCookieStore.setState({
      cookies: [
        { id: '1', name: 'a', ...base, path: '/admin' },
        { id: '2', name: 'b', ...base, secure: true },
        { id: '3', name: 'c', ...base, expires: '2020-01-01T00:00:00Z' },
        { id: '4', name: 'd', ...base },
      ],
    });
    const get = useCookieStore.getState().getCookiesHeaderForUrl;
    expect(get('http://127.0.0.1:8811/echo')).toBe('d=v');
    expect(get('http://127.0.0.1:8811/admin/x')).toBe('a=v; d=v');
    expect(get('https://127.0.0.1/echo')).toBe('b=v; d=v');
  });

  it('ingests Set-Cookie, replacing and deleting with Max-Age=0', () => {
    const st = () => useCookieStore.getState();
    st().storeSetCookies('http://127.0.0.1:8811/x', ['sid=abc; Path=/; HttpOnly', 'pref=dark; Max-Age=3600']);
    expect(st().cookies.map(c => c.name).sort()).toEqual(['pref', 'sid']);
    expect(st().cookies.find(c => c.name === 'sid')?.httpOnly).toBe(true);
    st().storeSetCookies('http://127.0.0.1:8811/x', 'sid=new; Path=/');
    expect(st().cookies.find(c => c.name === 'sid')?.value).toBe('new');
    st().storeSetCookies('http://127.0.0.1:8811/x', 'sid=; Max-Age=0; Path=/');
    expect(st().cookies.map(c => c.name)).toEqual(['pref']);
    st().deleteAllCookies();
    expect(st().cookies).toHaveLength(0);
  });

  it('detects expiry', () => {
    expect(isCookieExpired(undefined)).toBe(false);
    expect(isCookieExpired('2000-01-01')).toBe(true);
    expect(isCookieExpired('2999-01-01')).toBe(false);
  });
});

describe('transport helpers', () => {
  it('rejects non-http schemes and empty URLs, defaults to http://', () => {
    expect(normalizeRequestUrl('example.com')).toBe('http://example.com');
    expect(() => normalizeRequestUrl('')).toThrow();
    expect(() => normalizeRequestUrl('ftp://x')).toThrow(/Unsupported/);
    expect(() => normalizeRequestUrl('file:///etc/passwd')).toThrow(/Unsupported/);
    expect(() => normalizeRequestUrl('javascript:alert(1)')).toThrow(/Unsupported/);
  });

  it('encodes non-Latin-1 header values as UTF-8 bytes instead of throwing', () => {
    expect(() => new Headers({ 'X-Lang': toHeaderSafeValue('שלום') })).not.toThrow();
    expect(toHeaderSafeValue('plain')).toBe('plain');
  });

  it('warns about what a browser cannot honor', () => {
    const w = getBrowserTransportWarnings({ headers: { Host: 'x', 'X-A': '1' }, verifySsl: false, localProxy: { url: 'http://p' } });
    expect(w).toHaveLength(3);
    expect(getBrowserTransportWarnings({ headers: { 'X-A': '1' }, verifySsl: true })).toHaveLength(0);
  });
});

describe('load test helpers', () => {
  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    expect(percentile([5, 1, 3], 50)).toBe(3);
  });

  it('validates iterations and concurrency', () => {
    expect(validateLoadTestConfig(10, 2)).toBeNull();
    expect(validateLoadTestConfig(0, 1)).not.toBeNull();
    expect(validateLoadTestConfig(-5, 1)).not.toBeNull();
    expect(validateLoadTestConfig(NaN, 1)).not.toBeNull();
    expect(validateLoadTestConfig('', 1)).not.toBeNull();
    expect(validateLoadTestConfig(1_000_000, 1)).not.toBeNull();
    expect(validateLoadTestConfig(10, 0)).not.toBeNull();
  });
});

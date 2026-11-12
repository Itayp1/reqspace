import { describe, it, expect } from 'vitest';
// @ts-expect-error CommonJS module shared with the Electron main process
import httpRequest from '../../../electron/httpRequest.js';

const { hostnameMatches, findClientCertificate, bypassProxy } = httpRequest;

describe('client certificate hostname matching (P4.3)', () => {
  it('matches exact hostnames case-insensitively', () => {
    expect(hostnameMatches('api.example.com', 'API.example.com')).toBe(true);
    expect(hostnameMatches('api.example.com', 'other.example.com')).toBe(false);
  });
  it('wildcard matches subdomains but not the bare domain', () => {
    expect(hostnameMatches('*.example.com', 'api.example.com')).toBe(true);
    expect(hostnameMatches('*.example.com', 'a.b.example.com')).toBe(true);
    expect(hostnameMatches('*.example.com', 'example.com')).toBe(false);
    expect(hostnameMatches('*.example.com', 'evilexample.com')).toBe(false);
  });
  it('prefers exact over wildcard and returns undefined when nothing matches', () => {
    const certs = [{ hostname: '*.example.com', cert: 'W' }, { hostname: 'api.example.com', cert: 'E' }];
    expect(findClientCertificate(certs, 'api.example.com').cert).toBe('E');
    expect(findClientCertificate(certs, 'x.example.com').cert).toBe('W');
    expect(findClientCertificate(certs, 'example.com')).toBeUndefined();
    expect(findClientCertificate(undefined, 'a')).toBeUndefined();
  });
  it('honours the no-proxy list', () => {
    expect(bypassProxy('127.0.0.1, .corp.com', '127.0.0.1')).toBe(true);
    expect(bypassProxy('.corp.com', 'a.corp.com')).toBe(true);
    expect(bypassProxy('.corp.com', 'other.com')).toBe(false);
  });
});

describe('wildcard vs IP literals', () => {
  it('never matches an IP address', () => {
    expect(hostnameMatches('*.0.0.1', '127.0.0.1')).toBe(false);
  });
});

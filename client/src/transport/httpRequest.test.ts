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

describe('response size cap (maxBytes)', () => {
  const { sendRequest } = httpRequest;
  const serve = (handler: (res: any) => void) => new Promise<{ srv: any; url: string }>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const srv = require('http').createServer((_q: any, res: any) => handler(res));
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });

  it('returns a small body normally', async () => {
    const { srv, url } = await serve((res) => res.end('hello'));
    const r = await sendRequest({ url }, { maxBytes: 1000 });
    srv.close();
    expect(r.body).toBe('hello');
    expect(r.oversized).toBeUndefined();
  });

  it('stops buffering past the cap and leaves the rest of the stream readable', async () => {
    const { srv, url } = await serve(async (res) => {
      for (let i = 0; i < 3; i++) { res.write(Buffer.alloc(600, 'a')); await new Promise((r) => setTimeout(r, 50)); } // separate TCP chunks
      res.end();
    });
    const r = await sendRequest({ url }, { maxBytes: 1000 });
    expect(r.body).toBe('');
    expect(r.oversized.sizeKnown).toBe(false);
    const buffered = r.oversized.chunks.reduce((n: number, c: Buffer) => n + c.length, 0);
    expect(buffered).toBe(1200);
    let rest = 0;
    await new Promise<void>((done) => { r.oversized.res.on('data', (c: Buffer) => { rest += c.length; }); r.oversized.res.on('end', done); });
    srv.close();
    expect(buffered + rest).toBe(1800);
  });

  it('does not read anything when Content-Length is already over the cap', async () => {
    const { srv, url } = await serve((res) => { res.writeHead(200, { 'content-length': '5000' }); res.flushHeaders(); });
    const r = await sendRequest({ url }, { maxBytes: 1000 });
    expect(r.body).toBe('');
    expect(r.size).toBe(5000);
    expect(r.oversized).toMatchObject({ sizeKnown: true, chunks: [] });
    r.oversized.res.destroy();
    srv.closeAllConnections();
    srv.close();
  });
});

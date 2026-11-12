import { isPrivateOrReservedHost } from '../utils/ssrf';

// These cases all use literal hosts (IP literals or numeric forms), so no DNS
// lookup is performed — the tests are deterministic and offline. They cover the
// parser gaps called out in TODO.md CR#25.
describe('ssrf: isPrivateOrReservedHost', () => {
  const blocked = [
    ['loopback v4', '127.0.0.1'],
    ['RFC1918 10/8', '10.1.2.3'],
    ['RFC1918 192.168/16', '192.168.0.1'],
    ['RFC1918 172.16/12', '172.16.5.5'],
    ['link-local / cloud metadata', '169.254.169.254'],
    ['localhost name', 'localhost'],
    ['trailing-dot localhost', 'localhost.'],
    ['subdomain of localhost', 'api.localhost'],
    ['trailing-dot loopback', '127.0.0.1.'],
    ['decimal integer loopback', '2130706433'],
    ['hex integer loopback', '0x7f000001'],
    ['octal loopback', '017700000001'],
    ['loopback v6', '::1'],
    ['ipv4-mapped v6 (dotted)', '::ffff:127.0.0.1'],
    ['ipv4-mapped v6 (hex)', '::ffff:7f00:1'],
    ['NAT64 embedding loopback', '64:ff9b::7f00:1'],
    ['unique-local v6', 'fd00::1'],
  ] as const;

  const allowed = [
    ['public v4', '8.8.8.8'],
    ['public v4 #2', '1.1.1.1'],
    ['public v6', '2001:4860:4860::8888'],
    ['NAT64 embedding public v4 (8.8.8.8)', '64:ff9b::808:808'],
    ['decimal integer public (1.1.1.1)', '16843009'],
  ] as const;

  it.each(blocked)('blocks %s (%s)', async (_label, host) => {
    expect(await isPrivateOrReservedHost(host)).toBe(true);
  });

  it.each(allowed)('allows %s (%s)', async (_label, host) => {
    expect(await isPrivateOrReservedHost(host)).toBe(false);
  });
});

import dns from 'dns';
import net from 'net';

/**
 * Blocks requests to internal/private network destinations from the proxy,
 * share-proxy, capture, and WSDL-import routes — all of which let a
 * logged-in (or, for share-proxy, even anonymous) user make this
 * server issue an arbitrary outbound HTTP request. Without this, a hosted
 * multi-tenant deployment is an open SSRF pivot into its own private network
 * (other internal services, cloud metadata endpoints like 169.254.169.254,
 * localhost-bound admin ports, etc). Self-hosted single-tenant deployments
 * that legitimately need to target their own internal APIs can opt back in
 * via SystemConfig.proxy.allowPrivateTargets (admin-only, off by default).
 */

const BLOCKED_V4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

function ipv4ToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function longToIpv4(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');
}

/**
 * Parses non-dotted IPv4 literals that resolvers (and the OS) still accept:
 * a single decimal (`2130706433`), hex (`0x7f000001`) or octal (`017700000001`)
 * number. These bypass a naive dotted-quad private-range check but still route
 * to the encoded address (CR#25). Returns dotted form, or null if not such a
 * literal.
 */
function parseNumericIpv4(host: string): string | null {
  let value: number | null = null;
  if (/^0x[0-9a-f]+$/i.test(host)) {
    value = parseInt(host, 16);
  } else if (/^0[0-7]+$/.test(host)) {
    value = parseInt(host, 8);
  } else if (/^\d+$/.test(host)) {
    value = parseInt(host, 10);
  }
  if (value === null || !Number.isFinite(value) || value < 0 || value > 0xffffffff) return null;
  return longToIpv4(value >>> 0);
}

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToLong(ip);
  return BLOCKED_V4_RANGES.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToLong(base) & mask);
  });
}

/** Expands an IPv6 address (handling `::` compression and an optional trailing
 * dotted-quad) into its 16 bytes, or null if it can't be parsed. */
function expandV6ToBytes(ip: string): number[] | null {
  let s = ip.toLowerCase();
  if (s.includes('.')) {
    // Trailing embedded IPv4 (e.g. ::ffff:127.0.0.1 or 64:ff9b::127.0.0.1)
    const idx = s.lastIndexOf(':');
    const v4 = s.slice(idx + 1);
    if (net.isIP(v4) !== 4) return null;
    const long = ipv4ToLong(v4);
    const hi = ((long >>> 16) & 0xffff).toString(16);
    const lo = (long & 0xffff).toString(16);
    s = s.slice(0, idx + 1) + hi + ':' + lo;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - (head.length + tail.length);
  if (missing < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push((n >>> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local (fc00::/7)

  const bytes = expandV6ToBytes(normalized);
  if (bytes) {
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) both embed a v4
    // address in the low 32 bits — check it against the v4 ranges (CR#25).
    const isMapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
    const isNat64 = bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b;
    if (isMapped || isNat64) {
      const embedded = [bytes[12], bytes[13], bytes[14], bytes[15]].join('.');
      return isBlockedV4(embedded);
    }
  }
  return false;
}

function isBlockedAddress(address: string, family: number): boolean {
  return family === 4 ? isBlockedV4(address) : isBlockedV6(address);
}

/** Resolves a hostname (or passes through a literal IP) and reports whether any resolved address is private/reserved. */
export async function isPrivateOrReservedHost(hostname: string): Promise<boolean> {
  // Strip brackets and a single trailing dot (FQDN root form) — `localhost.`
  // and `127.0.0.1.` resolve the same but slip past a naive equality check.
  let host = hostname.replace(/^\[|\]$/g, '');
  host = host.replace(/\.$/, '');
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;

  const literalFamily = net.isIP(host);
  if (literalFamily) return isBlockedAddress(host, literalFamily);

  // Non-dotted numeric IPv4 literals (decimal/hex/octal) never reach dns.lookup
  // as an IP but the OS resolver would still route them (CR#25).
  const numeric = parseNumericIpv4(host);
  if (numeric) return isBlockedV4(numeric);

  try {
    const records = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
      dns.lookup(host, { all: true, verbatim: true }, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });
    if (records.length === 0) return true; // no address at all — nothing safe to connect to
    return records.some((r) => isBlockedAddress(r.address, r.family));
  } catch {
    // Fail closed: if the name doesn't resolve we can't prove it's safe.
    return true;
  }
}

export class SsrfBlockedError extends Error {
  constructor(message = 'Requests to internal/private network addresses are blocked. An admin can allow this in System Settings if this server legitimately needs to reach its own network.') {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/** Simple pre-flight check for callers (WSDL import) that can't pin the resolved IP on the actual connection. */
export async function assertSsrfSafe(targetUrl: string, allowPrivateTargets: boolean): Promise<void> {
  if (allowPrivateTargets) return;
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new SsrfBlockedError('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError('Only http/https URLs are allowed');
  }
  if (await isPrivateOrReservedHost(parsed.hostname)) {
    throw new SsrfBlockedError();
  }
}

/**
 * A dns.lookup-compatible function (for undici's `connect.lookup`) that
 * pins the resolved address at connect time — closing the TOCTOU gap a
 * separate "resolve, check, then fetch" pre-flight would leave open to
 * DNS-rebinding (the name could re-resolve to a private IP between the
 * check and the actual TCP connect).
 */
type NodeLookupCallback = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;

export function createSafeLookup(allowPrivateTargets: boolean) {
  return function safeLookup(hostname: string, options: dns.LookupOptions, callback: NodeLookupCallback): void {
    dns.lookup(hostname, { ...options, all: false, verbatim: true }, (err, address, family) => {
      if (err) return callback(err, address, family);
      if (!allowPrivateTargets && isBlockedAddress(address, family)) {
        return callback(new SsrfBlockedError() as NodeJS.ErrnoException, address, family);
      }
      callback(err, address, family);
    });
  };
}

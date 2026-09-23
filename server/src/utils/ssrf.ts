import dns from 'dns';
import net from 'net';

/**
 * Blocks requests to internal/private network destinations from the proxy,
 * share-proxy, capture, and WSDL-import routes — all of which let a
 * logged-in (or, for capture/share-proxy, even anonymous) user make this
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

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToLong(ip);
  return BLOCKED_V4_RANGES.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToLong(base) & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local (fc00::/7)
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — recurse into the embedded v4 address.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  return false;
}

function isBlockedAddress(address: string, family: number): boolean {
  return family === 4 ? isBlockedV4(address) : isBlockedV6(address);
}

/** Resolves a hostname (or passes through a literal IP) and reports whether any resolved address is private/reserved. */
export async function isPrivateOrReservedHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host.toLowerCase() === 'localhost') return true;

  const literalFamily = net.isIP(host);
  if (literalFamily) return isBlockedAddress(host, literalFamily);

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

/** Simple pre-flight check for callers (capture route, WSDL import) that can't pin the resolved IP on the actual connection. */
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

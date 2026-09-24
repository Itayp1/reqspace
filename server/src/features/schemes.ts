import crypto from 'crypto';

export function digestAuthorization(opts: {
  username: string;
  password: string;
  method: string;
  uri: string;
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
}): string {
  const ha1 = crypto.createHash('md5').update(`${opts.username}:${opts.realm}:${opts.password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${opts.method.toUpperCase()}:${opts.uri}`).digest('hex');
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const response = opts.qop
    ? crypto.createHash('md5').update(`${ha1}:${opts.nonce}:${nc}:${cnonce}:${opts.qop}:${ha2}`).digest('hex')
    : crypto.createHash('md5').update(`${ha1}:${opts.nonce}:${ha2}`).digest('hex');
  const parts = [
    `Digest username="${opts.username}"`,
    `realm="${opts.realm}"`,
    `nonce="${opts.nonce}"`,
    `uri="${opts.uri}"`,
    `response="${response}"`,
  ];
  if (opts.qop) parts.push(`qop=${opts.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opts.opaque) parts.push(`opaque="${opts.opaque}"`);
  return parts.join(', ');
}

export function oauth1Authorization(opts: {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  method: string;
  url: string;
}): string {
  const params: Record<string, string> = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: crypto.randomBytes(8).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  if (opts.token) params.oauth_token = opts.token;
  const encoded = Object.keys(params).sort().map((k) => `${encodeRfc(k)}=${encodeRfc(params[k])}`).join('&');
  const base = [opts.method.toUpperCase(), encodeRfc(opts.url.split('?')[0]), encodeRfc(encoded)].join('&');
  const key = `${encodeRfc(opts.consumerSecret)}&${encodeRfc(opts.tokenSecret || '')}`;
  params.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.entries(params).map(([k, v]) => `${encodeRfc(k)}="${encodeRfc(v)}"`).join(', ');
}

function encodeRfc(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function awsV4Authorization(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  method: string;
  url: string;
  body?: string;
  now?: Date;
}): { authorization: string; amzDate: string; payloadHash: string } {
  const now = opts.now || new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(opts.body || '').digest('hex');
  const parsed = new URL(opts.url);
  const canonicalHeaders = `host:${parsed.host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const canonical = [
    opts.method.toUpperCase(),
    parsed.pathname || '/',
    parsed.search.replace(/^\?/, ''),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n');
  const kDate = crypto.createHmac('sha256', `AWS4${opts.secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(opts.region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(opts.service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate,
    payloadHash,
  };
}

export function hawkAuthorization(opts: {
  id: string;
  key: string;
  method: string;
  url: string;
  algorithm?: 'sha256' | 'sha1';
  now?: number;
}): string {
  const parsed = new URL(opts.url);
  const ts = String(opts.now ?? Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(6).toString('hex');
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  const normalized = ['hawk.1.header', ts, nonce, opts.method.toUpperCase(), `${parsed.pathname}${parsed.search}`, parsed.hostname, port, '', ''].join('\n') + '\n';
  const mac = crypto.createHmac(opts.algorithm || 'sha256', opts.key).update(normalized).digest('base64');
  return `Hawk id="${opts.id}", ts="${ts}", nonce="${nonce}", mac="${mac}"`;
}

/** Akamai EdgeGrid signing (EG1-HMAC-SHA256). */
export function edgeGridAuthorization(opts: {
  clientToken: string;
  clientSecret: string;
  accessToken: string;
  method: string;
  url: string;
  body?: string;
  now?: Date;
}): string {
  const parsed = new URL(opts.url);
  const timestamp = (opts.now || new Date()).toISOString().replace(/\.\d{3}Z$/, '+0000');
  const nonce = crypto.randomBytes(8).toString('hex');
  const bodyHash = crypto.createHash('sha256').update(opts.body || '').digest('base64');
  const signingKey = crypto.createHmac('sha256', opts.clientSecret).update(timestamp).digest('base64');
  const data = [
    opts.method.toUpperCase(),
    parsed.protocol.replace(':', ''),
    parsed.host,
    `${parsed.pathname}${parsed.search}`,
    '',
    bodyHash,
  ].join('\t');
  const signature = crypto.createHmac('sha256', signingKey).update(data).digest('base64');
  return `EG1-HMAC-SHA256 client_token=${opts.clientToken};access_token=${opts.accessToken};timestamp=${timestamp};nonce=${nonce};signature=${signature}`;
}

function md4(data: Buffer): Buffer {
  const s = [
    [3, 7, 11, 19],
    [3, 5, 9, 13],
    [3, 9, 11, 15],
  ];
  const rot = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const f = (x: number, y: number, z: number) => (x & y) | (~x & z);
  const g = (x: number, y: number, z: number) => (x & y) | (x & z) | (y & z);
  const h = (x: number, y: number, z: number) => x ^ y ^ z;
  const len = data.length;
  const bitLen = len * 8;
  const pad = Buffer.alloc(((len + 8) >>> 6 << 6) + 64 - len);
  data.copy(pad);
  pad[len] = 0x80;
  pad.writeUInt32LE(bitLen >>> 0, pad.length - 8);
  pad.writeUInt32LE(Math.floor(bitLen / 0x100000000), pad.length - 4);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let i = 0; i < pad.length; i += 64) {
    const x = new Array<number>(16);
    for (let j = 0; j < 16; j++) x[j] = pad.readUInt32LE(i + j * 4);
    let aa = a, bb = b, cc = c, dd = d;
    const op = (fn: (x: number, y: number, z: number) => number, k: number, shift: number, idx: number, add: number) => {
      const t = (a + fn(b, c, d) + x[idx] + add) >>> 0;
      a = d; d = c; c = b; b = (b + rot(t, shift)) >>> 0;
      void k;
    };
    for (let j = 0; j < 16; j++) op(f, j, s[0][j % 4], j, 0);
    const gIdx = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
    for (let j = 0; j < 16; j++) op(g, j, s[1][j % 4], gIdx[j], 0x5a827999);
    const hIdx = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
    for (let j = 0; j < 16; j++) op(h, j, s[2][j % 4], hIdx[j], 0x6ed9eba1);
    a = (a + aa) >>> 0; b = (b + bb) >>> 0; c = (c + cc) >>> 0; d = (d + dd) >>> 0;
  }
  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0); out.writeUInt32LE(b, 4); out.writeUInt32LE(c, 8); out.writeUInt32LE(d, 12);
  return out;
}

export function ntlmType1(domain = '', workstation = ''): string {
  const signature = Buffer.from('NTLMSSP\0', 'ascii');
  const type = Buffer.alloc(4);
  type.writeUInt32LE(1, 0);
  const flags = Buffer.alloc(4);
  flags.writeUInt32LE(0x00088207, 0);
  const work = Buffer.from(workstation.toUpperCase(), 'ascii');
  const dom = Buffer.from(domain.toUpperCase(), 'ascii');
  const header = 32;
  const workSec = Buffer.alloc(8);
  workSec.writeUInt16LE(work.length, 0);
  workSec.writeUInt16LE(work.length, 2);
  workSec.writeUInt32LE(header, 4);
  const domSec = Buffer.alloc(8);
  domSec.writeUInt16LE(dom.length, 0);
  domSec.writeUInt16LE(dom.length, 2);
  domSec.writeUInt32LE(header + work.length, 4);
  return Buffer.concat([signature, type, flags, domSec, workSec, work, dom]).toString('base64');
}

export function ntlmType3(opts: { username: string; password: string; domain?: string; workstation?: string; type2: string }): string {
  const type2 = Buffer.from(opts.type2, 'base64');
  const challenge = type2.subarray(24, 32);
  const user = Buffer.from(opts.username, 'utf16le');
  const domain = Buffer.from((opts.domain || '').toUpperCase(), 'utf16le');
  const workstation = Buffer.from(opts.workstation || '', 'utf16le');
  const ntlmHash = md4(Buffer.from(opts.password, 'utf16le'));
  const ntowf = crypto.createHmac('md5', ntlmHash).update(Buffer.concat([
    Buffer.from(opts.username.toUpperCase(), 'utf16le'),
    domain,
  ])).digest();
  const clientChallenge = crypto.randomBytes(8);
  const blob = Buffer.concat([
    Buffer.from('01010000', 'hex'),
    Buffer.alloc(4),
    Buffer.alloc(8),
    clientChallenge,
    Buffer.alloc(4),
    Buffer.alloc(4),
  ]);
  const ntProof = crypto.createHmac('md5', ntowf).update(Buffer.concat([challenge, blob])).digest();
  const ntResp = Buffer.concat([ntProof, blob]);
  const lmResp = Buffer.alloc(24);
  const header = 64;
  const sec = (len: number, offset: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt16LE(len, 0);
    b.writeUInt16LE(len, 2);
    b.writeUInt32LE(offset, 4);
    return b;
  };
  let offset = header;
  const lmSec = sec(lmResp.length, offset); offset += lmResp.length;
  const ntSec = sec(ntResp.length, offset); offset += ntResp.length;
  const domSec = sec(domain.length, offset); offset += domain.length;
  const userSec = sec(user.length, offset); offset += user.length;
  const workSec = sec(workstation.length, offset); offset += workstation.length;
  const session = Buffer.alloc(8);
  const flags = Buffer.alloc(4);
  flags.writeUInt32LE(0x00088201, 0);
  return Buffer.concat([
    Buffer.from('NTLMSSP\0', 'ascii'), Buffer.from([3, 0, 0, 0]),
    lmSec, ntSec, domSec, userSec, workSec, session, flags,
    lmResp, ntResp, domain, user, workstation,
  ]).toString('base64');
}

export function parseDigestChallenge(header: string): { realm: string; nonce: string; qop?: string; opaque?: string } | null {
  const realm = /realm="([^"]+)"/i.exec(header)?.[1];
  const nonce = /nonce="([^"]+)"/i.exec(header)?.[1];
  if (!realm || !nonce) return null;
  const qop = /qop="?([^",]+)"?/i.exec(header)?.[1]?.split(',')[0];
  const opaque = /opaque="([^"]+)"/i.exec(header)?.[1];
  return { realm, nonce, qop, opaque };
}

export function authorizationForAuth(auth: any, method: string, url: string, body?: string): Record<string, string> {
  if (!auth || auth.type === 'none' || auth.type === 'inherit') return {};
  if (auth.type === 'bearer' && auth.bearer?.token) return { authorization: `Bearer ${auth.bearer.token}` };
  if (auth.type === 'basic' && auth.basic?.username) {
    const token = Buffer.from(`${auth.basic.username}:${auth.basic.password || ''}`).toString('base64');
    return { authorization: `Basic ${token}` };
  }
  if (auth.type === 'oauth2' && auth.oauth2?.token) return { authorization: `Bearer ${auth.oauth2.token}` };
  if (auth.type === 'oauth1' && auth.oauth1?.consumerKey) {
    return { authorization: oauth1Authorization({ ...auth.oauth1, method, url }) };
  }
  if (auth.type === 'awsv4' && auth.awsv4?.accessKeyId) {
    const signed = awsV4Authorization({ ...auth.awsv4, method, url, body });
    return { authorization: signed.authorization, 'x-amz-date': signed.amzDate, 'x-amz-content-sha256': signed.payloadHash };
  }
  if (auth.type === 'hawk' && auth.hawk?.id && auth.hawk?.key) {
    return { authorization: hawkAuthorization({ ...auth.hawk, method, url }) };
  }
  if (auth.type === 'edgegrid' && auth.edgegrid?.clientToken) {
    return { authorization: edgeGridAuthorization({ ...auth.edgegrid, method, url, body }) };
  }
  return {};
}

export const GRAPHQL_INTROSPECTION = '{ __schema { queryType { name } types { name kind } } }';

export function graphqlBody(query: string, variables?: Record<string, unknown>): string {
  return JSON.stringify({ query, variables: variables || {} });
}

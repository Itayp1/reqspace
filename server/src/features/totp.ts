import crypto from 'crypto';

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

export function generateTotpSecret(): string {
  return crypto.randomBytes(20).toString('base64url');
}

export function totpCode(secret: string, now = Date.now()): string {
  const key = Buffer.from(secret, 'base64url');
  const counter = Math.floor(now / 1000 / 30);
  return hotp(key, counter);
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!secret || !/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((skew) => totpCode(secret, now + skew * 30_000) === code);
}

export function otpauthUrl(email: string, secret: string): string {
  return `otpauth://totp/ReqSpace:${encodeURIComponent(email)}?secret=${secret}&issuer=ReqSpace&algorithm=SHA1&digits=6&period=30`;
}

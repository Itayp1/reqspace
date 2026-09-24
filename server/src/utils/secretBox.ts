import crypto from 'crypto';
import { resolveJwtSecret } from './jwtSecret';

const MARK = 'enc.v1';

function keyBytes(): Buffer {
  const raw = process.env.CERT_ENCRYPTION_KEY;
  if (raw && /^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const material = raw || resolveJwtSecret();
  return crypto.createHash('sha256').update(material).digest();
}

/** AES-256-GCM. Already-sealed values are returned unchanged. */
export function encryptSecret(plain: string | undefined | null): string {
  if (!plain) return plain || '';
  if (plain.startsWith(`${MARK}.`)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [MARK, iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decryptSecret(value: string | undefined | null): string {
  if (!value) return value || '';
  if (!value.startsWith(`${MARK}.`)) return value;
  const [ivB64, tagB64, dataB64] = value.slice(MARK.length + 1).split('.');
  if (!ivB64 || !tagB64 || !dataB64) return value;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function sealCertificates(certs: any[] | undefined): any[] | undefined {
  if (!certs) return certs;
  return certs.map(c => ({
    ...c,
    cert: encryptSecret(c.cert),
    key: encryptSecret(c.key),
    passphrase: c.passphrase ? encryptSecret(c.passphrase) : c.passphrase,
  }));
}

export function openCertificates(certs: any[] | undefined): any[] {
  return (certs || []).map(c => ({
    ...c,
    _id: c._id?.toString?.() ?? c._id,
    cert: decryptSecret(c.cert),
    key: decryptSecret(c.key),
    passphrase: c.passphrase ? decryptSecret(c.passphrase) : c.passphrase,
  }));
}

/** Hostname and id only. Private key material stays on the server. */
export function publicCertificates(certs: any[] | undefined) {
  return (certs || []).map(c => ({
    _id: c._id?.toString?.() ?? c._id,
    hostname: c.hostname,
    createdAt: c.createdAt,
  }));
}

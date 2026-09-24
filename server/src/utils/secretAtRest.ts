import crypto from 'crypto';
import { resolveJwtSecret } from './jwtSecret';

/** Prefix so we can tell ciphertext from legacy plaintext rows. */
const PREFIX = 'enc:v1:';

function key(): Buffer {
  return crypto.createHash('sha256').update(resolveJwtSecret()).digest();
}

/** AES-256-GCM. Already-sealed values are returned unchanged. */
export function encryptSecret(plain: string | undefined | null): string {
  if (plain == null || plain === '') return plain ?? '';
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypts `enc:v1:` values. Legacy plaintext is returned as-is. */
export function decryptSecret(value: string | undefined | null): string {
  if (value == null || value === '') return value ?? '';
  if (!value.startsWith(PREFIX)) return value;
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isSealed(value: string | undefined | null): boolean {
  return !!value && value.startsWith(PREFIX);
}

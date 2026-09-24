import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function key(): Buffer {
  const raw = process.env.CERT_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!raw) {
    throw new Error('CERT_ENCRYPTION_KEY (or JWT_SECRET) is required to store client certificates');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string | undefined | null): string {
  if (!plain) return '';
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(stored: string | undefined | null): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function publicCertificate(cert: any) {
  return { _id: cert._id, hostname: cert.hostname, createdAt: cert.createdAt };
}

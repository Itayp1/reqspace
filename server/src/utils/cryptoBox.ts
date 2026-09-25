import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_HEX = process.env.CERT_ENCRYPTION_KEY || '';

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith('v1.gcm.');
}

export function seal(plaintext: string): string {
  if (!KEY_HEX) throw new Error('CERT_ENCRYPTION_KEY is required to seal data');
  if (KEY_HEX.length !== 64) throw new Error('CERT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  
  const key = Buffer.from(KEY_HEX, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  
  // Format: v1.gcm.IV.AUTHTAG.CIPHERTEXT
  return `v1.gcm.${iv.toString('base64')}.${authTag}.${encrypted}`;
}

export function open(sealed: string): string {
  if (!isEncrypted(sealed)) return sealed; // Support legacy plaintext
  if (!KEY_HEX) throw new Error('CERT_ENCRYPTION_KEY is required to open data');
  if (KEY_HEX.length !== 64) throw new Error('CERT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  
  const parts = sealed.split('.');
  if (parts.length !== 5) throw new Error('Invalid encrypted data format');
  
  const [v, gcm, ivB64, authB64, cipherB64] = parts;
  const key = Buffer.from(KEY_HEX, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authB64, 'base64');
  
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(cipherB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

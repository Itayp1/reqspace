import { QueryInterface } from 'sequelize';
import { seal, isEncrypted } from './cryptoBox';
import { getCertKey } from './secrets';
import { sealConfigSecrets } from '../repositories/SystemConfigRepository';
import { getSequelize } from '../db/sequelize';

const CERT_KEY_RE = /^[0-9a-fA-F]{64}$/;

function hasUsableKey(): boolean {
  const key = getCertKey();
  return !!key && CERT_KEY_RE.test(key);
}

/** Seals client-certificate keys and passphrases still stored in plaintext. Safe to run repeatedly. */
export async function sealClientCertificates(qi: QueryInterface): Promise<void> {
  if (!hasUsableKey()) return;
  const col = qi.quoteIdentifier('clientCertificates');
  const [users] = await qi.sequelize.query(`SELECT id, ${col} FROM users WHERE ${col} IS NOT NULL`);

  for (const user of users as any[]) {
    if (!user.clientCertificates) continue;
    let certs;
    try {
      certs = typeof user.clientCertificates === 'string' ? JSON.parse(user.clientCertificates) : user.clientCertificates;
    } catch {
      continue;
    }
    let changed = false;
    for (const cert of certs) {
      if (cert.key && !isEncrypted(cert.key)) {
        cert.key = seal(cert.key);
        changed = true;
      }
      if (cert.passphrase && !isEncrypted(cert.passphrase)) {
        cert.passphrase = seal(cert.passphrase);
        changed = true;
      }
    }
    if (changed) {
      await qi.sequelize.query(`UPDATE users SET ${col} = :certs WHERE id = :id`, {
        replacements: { certs: JSON.stringify(certs), id: user.id },
      });
    }
  }
}

/**
 * Seals the credentials stored in system_config (OAuth client secrets, SMTP password, proxy
 * password) that were written as plaintext. It works on the raw stored rows and never decrypts,
 * so a wrong key cannot turn existing ciphertext into empty values. Already sealed values are left alone.
 */
export async function sealSystemConfig(qi: QueryInterface): Promise<void> {
  if (!hasUsableKey()) return;
  const [rows] = await qi.sequelize.query('SELECT id, auth, proxy FROM system_config');
  for (const row of rows as any[]) {
    let auth: any;
    let proxy: any;
    try {
      auth = JSON.parse(row.auth);
      proxy = JSON.parse(row.proxy);
    } catch {
      continue;
    }
    const before = JSON.stringify([auth, proxy]);
    sealConfigSecrets(auth, proxy);
    if (JSON.stringify([auth, proxy]) === before) continue;
    await qi.sequelize.query('UPDATE system_config SET auth = :auth, proxy = :proxy WHERE id = :id', {
      replacements: { auth: JSON.stringify(auth), proxy: JSON.stringify(proxy), id: row.id },
    });
  }
}

/** Seals whatever the configured key allows. Runs at every boot, so plaintext left behind gets sealed once a key exists. */
export async function sealPendingSecrets(): Promise<void> {
  const qi = getSequelize().getQueryInterface();
  await sealClientCertificates(qi);
  await sealSystemConfig(qi);
}

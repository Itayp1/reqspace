import { QueryInterface, DataTypes } from 'sequelize';
import { getSequelize } from '../sequelize';
import { seal, isEncrypted } from '../../utils/cryptoBox';

export async function up({ context: qi }: { context: QueryInterface }) {
  const sequelize = getSequelize();
  
  if (!process.env.CERT_ENCRYPTION_KEY) {
    throw new Error('CERT_ENCRYPTION_KEY must be set in the environment to migrate client certificates (SEC-8). This is an irreversible, required security migration. Do not proceed until the key is configured.');
  }

  // We read from users table directly
  const [users] = await sequelize.query('SELECT id, clientCertificates FROM users WHERE clientCertificates IS NOT NULL');
  
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
      await sequelize.query(
        'UPDATE users SET clientCertificates = :certs WHERE id = :id',
        {
          replacements: {
            certs: JSON.stringify(certs),
            id: user.id
          }
        }
      );
    }
  }
}

export async function down() {
  // Irreversible
}

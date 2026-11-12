import { QueryInterface } from 'sequelize';
import { sealSystemConfig } from '../../utils/sealAtRest';

/**
 * Seals the credentials stored in system_config (OAuth client secrets, SMTP
 * password, proxy password) that older versions wrote as plaintext. Values that
 * are already sealed are left alone, so re-running is safe. Without a key nothing
 * happens here; sealPendingSecrets() seals them at boot once a key exists.
 */
export async function up({ context: qi }: { context: QueryInterface }) {
  await sealSystemConfig(qi);
}

export async function down() {
  // Irreversible by design: secrets stay sealed.
}

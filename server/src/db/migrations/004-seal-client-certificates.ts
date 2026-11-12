import { QueryInterface } from 'sequelize';
import { sealClientCertificates } from '../../utils/sealAtRest';

export async function up({ context: qi }: { context: QueryInterface }) {
  // Without a key nothing is sealed yet; sealPendingSecrets() seals at boot once a key exists.
  await sealClientCertificates(qi);
}

export async function down() {
  // Irreversible
}

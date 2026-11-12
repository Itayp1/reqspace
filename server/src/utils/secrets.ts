/**
 * Two secrets the server needs before it can sign a login or read stored credentials:
 *   JWT_SECRET            signs session tokens (the `token` cookie is a JWT)
 *   CERT_ENCRYPTION_KEY   encrypts credentials stored in the database (AES-256-GCM)
 *
 * Both come from the environment only. The login page can generate a value in the browser;
 * the operator copies it into the server's environment and restarts. The server never creates,
 * stores or returns these values, and they are not kept in the database.
 */

const KNOWN_INSECURE_JWT = new Set([
  'changeme',
  'changeme123',
  // Was committed to k8s/secret.yaml as base64 — public in this repo's history.
  'change_me_in_production',
  'change_me_in_production_very_long_secret_key',
  'secret',
  'jwt_secret',
  'your-secret-key',
]);
const MIN_JWT_LENGTH = 32;
const CERT_KEY_RE = /^[0-9a-fA-F]{64}$/;

export function getJwtSecret(): string | null {
  return process.env.JWT_SECRET || null;
}

export function getCertKey(): string | null {
  return process.env.CERT_ENCRYPTION_KEY || null;
}

/** Rejects a value set in the environment that cannot work. Missing values are not an error here. */
export function checkEnvSecrets(): void {
  const jwt = process.env.JWT_SECRET;
  if (jwt) {
    if (KNOWN_INSECURE_JWT.has(jwt)) {
      throw new Error('JWT_SECRET is a known placeholder or publicly leaked value and cannot be used. Generate a real one: openssl rand -hex 32');
    }
    if (process.env.NODE_ENV === 'production' && jwt.length < MIN_JWT_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${MIN_JWT_LENGTH} characters in production.`);
    }
  }
  const cert = process.env.CERT_ENCRYPTION_KEY;
  if (cert && !CERT_KEY_RE.test(cert)) {
    throw new Error('CERT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate one: openssl rand -hex 32');
  }
}

/** Which secrets are configured. Booleans only: the values never leave the process. */
export function secretStatus(): Record<'JWT_SECRET' | 'CERT_ENCRYPTION_KEY', boolean> {
  return {
    JWT_SECRET: !!getJwtSecret(),
    CERT_ENCRYPTION_KEY: !!getCertKey(),
  };
}

/** Logs what is missing so it shows up in the console, not only on the login page. */
export function warnMissingSecrets(): void {
  const status = secretStatus();
  const missing = (Object.keys(status) as Array<keyof typeof status>).filter((name) => !status[name]);
  if (missing.length === 0) return;
  console.warn(
    `⚠️  Not configured: ${missing.join(', ')}. Open the app, use Generate on the login page, copy the value into the server's environment variables and restart.`,
  );
}

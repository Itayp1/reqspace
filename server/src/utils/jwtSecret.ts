import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Gitignored (see server/.gitignore) — local-only, never committed.
const SECRET_FILE = path.resolve(__dirname, '../../.jwt-secret.local');

const KNOWN_INSECURE_VALUES = new Set([
  'changeme',
  'change_me_in_production',
  'change_me_in_production_very_long_secret_key',
  'secret',
  'jwt_secret',
  'your-secret-key',
]);

// Below this length a brute-force / dictionary attack against HS256 becomes
// realistic. Only enforced in production — local dev can use a short one.
const MIN_SECRET_LENGTH = 32;

let cached: string | null = null;

/** Test-only: clears the memoised secret so a fresh env var takes effect. */
export function _resetJwtSecretCacheForTests(): void {
  cached = null;
}

/**
 * Resolves the JWT signing secret. A real JWT_SECRET in .env always wins.
 * Otherwise this auto-generates a random secret on first boot and persists
 * it to a local, gitignored file so restarts don't invalidate every
 * session — this replaces what used to be a hardcoded 'changeme' fallback,
 * which let anyone forge a valid session token for any user (including
 * superadmins) using a value published in this open-source repo's history.
 */
export function resolveJwtSecret(): string {
  if (cached) return cached;

  const fromEnv = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (fromEnv) {
    // A known placeholder is never acceptable, in any environment — it is
    // published in this repo's history (and in k8s/secret.yaml), so anyone
    // can forge a session for any user, superadmin included, the moment a
    // deployment is left on it.
    if (KNOWN_INSECURE_VALUES.has(fromEnv)) {
      throw new Error(
        `JWT_SECRET is set to a known placeholder value ("${fromEnv}"). ` +
        'Generate a real one: openssl rand -hex 32',
      );
    }
    if (isProd && fromEnv.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production (got ${fromEnv.length}). ` +
        'Generate a real one: openssl rand -hex 32',
      );
    }
    cached = fromEnv;
    return cached;
  }

  // In production a per-pod generated secret means every replica signs with a
  // different key, so sessions break behind a load balancer and tokens can't be
  // validated across nodes (CR#6). Refuse to boot without a real shared secret,
  // unless a single-node deployment explicitly opts in.
  if (isProd && process.env.ALLOW_EPHEMERAL_JWT_SECRET !== 'true') {
    throw new Error(
      'JWT_SECRET must be set to a strong, shared value in production. ' +
      'Set JWT_SECRET (same value on every replica), or set ALLOW_EPHEMERAL_JWT_SECRET=true for a deliberate single-node deployment.',
    );
  }

  try {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing) {
      cached = existing;
      return cached;
    }
  } catch {
    // no local secret file yet — fall through to generating one
  }

  const generated = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
    console.warn(
      `⚠️  JWT_SECRET was not set (or was left at its insecure example value) — generated a random secret and saved it to ${SECRET_FILE}. ` +
      'Set JWT_SECRET in your .env for real deployments so every server instance shares the same signing key.',
    );
  } catch (err) {
    console.warn(
      '⚠️  JWT_SECRET was not set and a generated one could not be persisted to disk — sessions will not survive a restart. Set JWT_SECRET in .env.',
      err,
    );
  }
  cached = generated;
  return cached;
}

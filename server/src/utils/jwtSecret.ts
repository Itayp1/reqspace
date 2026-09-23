import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Gitignored (see server/.gitignore) — local-only, never committed.
const SECRET_FILE = path.resolve(__dirname, '../../.jwt-secret.local');

const KNOWN_INSECURE_VALUES = new Set([
  'changeme',
  'change_me_in_production_very_long_secret_key',
]);

let cached: string | null = null;

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
  if (fromEnv && !KNOWN_INSECURE_VALUES.has(fromEnv)) {
    cached = fromEnv;
    return cached;
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

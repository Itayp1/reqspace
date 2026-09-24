import mongoose from 'mongoose';
import { isMongo } from '../db/connect';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dialect-agnostic id validation. Mongo ids are 24-char hex ObjectIds; the SQL
 * backends use UUID v4 strings. The old code gated every route on
 * `mongoose.isValidObjectId`, which rejects UUIDs outright and made SQL
 * unusable past the auth boundary (CR#1). Validate against whichever id shape
 * the active backend actually issues.
 */
export function isValidId(id: unknown): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  if (isMongo()) return mongoose.isValidObjectId(id);
  return UUID_RE.test(id);
}

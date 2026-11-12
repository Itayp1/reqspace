const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a UUID string.
 */
export function isValidId(id: unknown): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  return UUID_RE.test(id);
}

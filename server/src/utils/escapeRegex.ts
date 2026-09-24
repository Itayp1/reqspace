/**
 * Escapes a string for safe use inside a `new RegExp(...)`. Passing raw user
 * input into a regex is both a ReDoS vector (catastrophic backtracking) and,
 * for anchored lookups, lets crafted metacharacters change the match scope.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

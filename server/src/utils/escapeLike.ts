import { getSequelize } from '../db/sequelize';

/** Hard cap on how long a search term may be before it reaches the database. */
export const MAX_SEARCH_LENGTH = 100;

/**
 * Escapes the wildcards in a user-supplied `LIKE` search term.
 *
 * Sequelize parameterises the value, so this is not an injection fix. It stops
 * `%` and `_` from silently widening the match — a search for `%` otherwise
 * returns every row the caller can see — and keeps the pattern anchored to what
 * the user actually typed.
 *
 * `\` is the default escape character on postgres, mysql and sqlite. mssql has
 * no default escape character and uses bracket expressions instead, so it needs
 * a different transform; DB_TYPE still accepts 'mssql', hence the dialect check.
 */
export function escapeLike(value: string): string {
  let dialect: string;
  try {
    dialect = getSequelize().getDialect();
  } catch {
    // No connection yet (or a non-SQL backend) — the backslash form is correct
    // for all three supported dialects, so it is the safe default.
    dialect = 'sqlite';
  }

  if (dialect === 'mssql') {
    return value.replace(/[[\]%_]/g, (c) => `[${c}]`);
  }
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

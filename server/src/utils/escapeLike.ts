import { getSequelize } from '../db/sequelize';
import { Op } from 'sequelize';

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

/**
 * A `WHERE` fragment matching `term` anywhere in any of `columns`, with `%`/`_` in the term taken
 * literally. Sequelize's `Op.like` adds no ESCAPE clause and sqlite has no default escape character,
 * so on sqlite the escaped backslashes would otherwise be matched literally and find nothing; postgres
 * and mysql default to backslash, so they use the plain operator.
 */
export function likeAnyColumn(columns: string[], term: string): Record<symbol, unknown> {
  const sq = getSequelize();
  const pattern = `%${escapeLike(term)}%`;
  if (sq.getDialect() !== 'sqlite') {
    return { [Op.or]: columns.map((c) => ({ [c]: { [Op.like]: pattern } })) };
  }
  const qi = sq.getQueryInterface();
  return { [Op.or]: columns.map((c) => sq.literal(`${qi.quoteIdentifier(c)} LIKE ${sq.escape(pattern)} ESCAPE '\\'`)) };
}

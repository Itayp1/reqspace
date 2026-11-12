/**
 * Body for the 503 the '/api' gate returns while the database is unreachable.
 *
 * The raw driver message routinely names the host, port, database and user —
 * `Access denied for user 'u'@'1.2.3.4' (using password: YES)` — and this gate
 * answers *unauthenticated* callers on every path, so production gets the same
 * generic string /api/health already uses (CR#24).
 *
 * The masked value is deliberately a non-empty string rather than `undefined`:
 * the client decides whether to show its DB-error screen from this body, and a
 * missing key would make it fall through to the login page against a dead API
 * with no explanation at all.
 */
export function dbDownBody(args: {
  dbStatus: string;
  dbError: string | null;
  dbType: string;
  isProd: boolean;
}) {
  return {
    message: 'Database not available',
    dbError: args.isProd ? 'Database unavailable' : (args.dbError || 'Database is not connected'),
    // Naming the backend to an anonymous caller buys nothing operationally.
    dbType: args.isProd ? undefined : args.dbType,
    dbStatus: args.dbStatus,
  };
}

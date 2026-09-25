import { dbDownBody } from '../utils/dbGate';

// A real message this project's own debugging produced against a remote MySQL.
const REAL_DRIVER_ERROR = "Access denied for user 'sql7837542'@'46.210.27.183' (using password: YES)";

describe('dbDownBody', () => {
  it('never leaks the driver message in production', () => {
    const body = dbDownBody({
      dbStatus: 'error',
      dbError: REAL_DRIVER_ERROR,
      dbType: 'mysql',
      isProd: true,
    });
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain('Access denied');
    expect(serialised).not.toContain('sql7837542');
    expect(serialised).not.toContain('46.210.27.183');
    expect(serialised).not.toContain('mysql');
  });

  it('still tells the client there is a database problem', () => {
    // The client keys its DB-error screen off this field, so it must be truthy.
    const body = dbDownBody({ dbStatus: 'error', dbError: REAL_DRIVER_ERROR, dbType: 'mysql', isProd: true });
    expect(body.dbError).toBeTruthy();
    expect(body.dbStatus).toBe('error');
  });

  it('passes the real message through outside production', () => {
    const body = dbDownBody({ dbStatus: 'error', dbError: REAL_DRIVER_ERROR, dbType: 'mysql', isProd: false });
    expect(body.dbError).toBe(REAL_DRIVER_ERROR);
    expect(body.dbType).toBe('mysql');
  });

  it('falls back to a message when the error is null', () => {
    const body = dbDownBody({ dbStatus: 'starting', dbError: null, dbType: 'sqlite', isProd: false });
    expect(body.dbError).toBe('Database is not connected');
  });
});

import fs from 'fs';
import { SqlFpError } from '../db/sql-models';
import { recordError, recordHandledError, noteRouteError } from '../utils/errorReporter';

jest.mock('../db/sql-models', () => ({ SqlFpError: { create: jest.fn() } }));

const create = SqlFpError.create as unknown as jest.Mock;

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({});
  jest.restoreAllMocks();
  create.mockResolvedValue({});
});

describe('recordError', () => {
  it('redacts secrets and clips oversized fields before insert', async () => {
    await recordError({
      source: 'client',
      kind: 'api',
      message: 'failed token=abc123 and Bearer xyz.abc',
      stack: 'x'.repeat(20000),
      status: 500,
    });

    const row = create.mock.calls[0][0];
    expect(row.message).toBe('failed token=[redacted] and Bearer [redacted]');
    expect(row.stack).toHaveLength(10000);
    expect(row.source).toBe('client');
    expect(row.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('drops a repeat of the same fault inside the dedupe window and records it again after', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const input = { source: 'server' as const, kind: 'server-5xx', message: 'dedupe-case GET /x responded 500' };

    await recordError(input);
    await recordError(input);
    expect(create).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 61_000);
    await recordError(input);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('writes a fallback line and never rejects when the insert fails', async () => {
    create.mockRejectedValue(new Error('db down'));
    const append = jest.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      recordError({ source: 'server', kind: 'process', message: 'fallback-case' }),
    ).resolves.toBeUndefined();

    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][1]).toContain('"message":"fallback-case"');
  });
});

describe('recordHandledError', () => {
  it('records a survived server error with its real message and stack', async () => {
    recordHandledError('audit-log', new Error('handled-case boom'));
    await new Promise((r) => setImmediate(r));
    const row = create.mock.calls[0][0];
    expect(row.source).toBe('server');
    expect(row.kind).toBe('audit-log');
    expect(row.message).toBe('handled-case boom');
    expect(row.stack).toContain('handled-case boom');
  });

  it('accepts non-Error throwables', async () => {
    recordHandledError('rate-limit', 'plain string failure');
    await new Promise((r) => setImmediate(r));
    expect(create.mock.calls[0][0].message).toBe('plain string failure');
  });
});

describe('noteRouteError', () => {
  it('stores the error on res.locals for the finish hook', () => {
    const res = { locals: {} as Record<string, any> };
    const err = new Error('route boom');
    noteRouteError(res, err);
    expect(res.locals.routeError).toBe(err);
  });
});

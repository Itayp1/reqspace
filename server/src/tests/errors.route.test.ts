import request from 'supertest';
import { app } from '../index';
import { SqlFpError } from '../db/sql-models';

jest.mock('../db/sql-models', () => {
  const actual = jest.requireActual('../db/sql-models');
  return { ...actual, SqlFpError: { create: jest.fn().mockResolvedValue({}) } };
});

const create = SqlFpError.create as unknown as jest.Mock;

let forwardedFor = 0;
const nextIp = () => `10.42.0.${++forwardedFor}`;

describe('POST /api/errors', () => {
  beforeEach(() => create.mockClear());

  it('stores a client report and answers 204', async () => {
    const res = await request(app)
      .post('/api/errors')
      .set('X-Forwarded-For', nextIp())
      .set('User-Agent', 'jest-agent')
      .send({ kind: 'react-boundary', message: 'boom', componentStack: 'in App', route: '/collections' });

    expect(res.status).toBe(204);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      source: 'client',
      kind: 'react-boundary',
      message: 'boom',
      componentStack: 'in App',
      route: '/collections',
      userAgent: 'jest-agent',
    }));
  });

  it('accepts reports while the main DB is not initialised (no DB gate)', async () => {
    const res = await request(app)
      .post('/api/errors')
      .set('X-Forwarded-For', nextIp())
      .send({ kind: 'api', message: 'Network Error', status: 503 });

    expect(res.status).toBe(204);
  });

  it('rejects a body with an unknown kind', async () => {
    const res = await request(app)
      .post('/api/errors')
      .set('X-Forwarded-For', nextIp())
      .send({ kind: 'made-up', message: 'x' });

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an unknown field so clients cannot set server-only columns', async () => {
    const res = await request(app)
      .post('/api/errors')
      .set('X-Forwarded-For', nextIp())
      .send({ kind: 'api', message: 'x', source: 'server' });

    expect(res.status).toBe(400);
  });

  it('rate limits a single address to 60 reports per minute', async () => {
    const ip = nextIp();
    let last = 0;
    for (let i = 0; i < 61; i++) {
      const res = await request(app)
        .post('/api/errors')
        .set('X-Forwarded-For', ip)
        .send({ kind: 'api', message: `burst ${i}` });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

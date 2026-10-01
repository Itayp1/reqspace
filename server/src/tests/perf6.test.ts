/**
 * PERF-6 — the tree/list projection actually trims the wire payload.
 *
 * SQLite in-memory, no live server — same pattern as db.repositories.test.ts.
 */
import { Sequelize } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { gzipSync } from 'zlib';

let sq: Sequelize;

jest.mock('../db/sequelize', () => {
  const actual = jest.requireActual('../db/sequelize');
  return { ...actual, getSequelize: () => sq, initSequelize: () => sq };
});

jest.mock('../db/connect', () => ({
  isMongo: () => false,
  connectDb: jest.fn(),
}));

import { initSqlModels } from '../db/sql-models';
import { RequestRepository } from '../repositories/RequestRepository';

beforeAll(async () => {
  sq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  initSqlModels();
  await sq.sync({ force: true });
});

afterAll(async () => {
  await sq.close();
});

describe('PERF-6: request summary projection', () => {
  const collectionId = uuidv4();
  // A realistic-weight row: headers, a body, and non-trivial pre-request/test
  // scripts — the fields summaryOnly is supposed to leave out.
  const heavyScript = 'pm.test("check", () => { pm.expect(pm.response.code).to.equal(200); });\n'.repeat(20);

  beforeAll(async () => {
    for (let i = 0; i < 500; i++) {
      await RequestRepository.create({
        name: `Request ${i}`,
        method: 'POST',
        url: `https://api.example.com/v1/resource/${i}`,
        collectionId,
        createdBy: 'seed-user',
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true },
          { key: 'Authorization', value: 'Bearer some-long-lived-token-value', enabled: true },
        ],
        body: { mode: 'raw', raw: JSON.stringify({ field1: 'value1', field2: 'value2', nested: { a: 1, b: 2 } }) },
        preRequestScript: heavyScript,
        testScript: heavyScript,
        order: i,
      } as any);
    }
  }, 30000);

  it('findByCollection (full records) exceeds 50 KB uncompressed for 500 requests — proves the fixture is realistic', async () => {
    const full = await RequestRepository.findByCollection(collectionId);
    expect(full.length).toBe(500);
    const bytes = Buffer.byteLength(JSON.stringify(full), 'utf8');
    expect(bytes).toBeGreaterThan(50 * 1024);
  });

  it('findByCollections({ summaryOnly }) keeps the same 500-request tree payload under 50 KB on the wire (gzipped, matching index.ts\'s compression() middleware)', async () => {
    const summary = await RequestRepository.findByCollections([collectionId], { summaryOnly: true });
    expect(summary.length).toBe(500);
    const json = JSON.stringify(summary);
    const wireBytes = gzipSync(json).length;
    expect(wireBytes).toBeLessThan(50 * 1024);
    // And it must still carry what the tree UI actually renders.
    expect(summary[0]).toMatchObject({ name: 'Request 0', method: 'POST', order: 0, collectionId });
    // summaryOnly stubs the heavy fields rather than omitting them.
    expect((summary[0] as any).headers).toEqual([]);
    expect((summary[0] as any).body).toEqual({ mode: 'none' });
    expect((summary[0] as any).preRequestScript).toBe('');
  });
});

import { Sequelize } from 'sequelize';

let sq: Sequelize;

// Mock the sequelize singleton so the repositories and sealing helpers get the test instance
jest.mock('../db/sequelize', () => {
  const actual = jest.requireActual('../db/sequelize');
  return { ...actual, getSequelize: () => sq, initSequelize: () => sq };
});

import { initSqlModels, SqlSystemConfig } from '../db/sql-models';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { systemConfigCache } from '../utils/cache';
import { sealSystemConfig, sealPendingSecrets } from '../utils/sealAtRest';

const KEY_A = '0123456789abcdef'.repeat(4);
const KEY_B = 'fedcba9876543210'.repeat(4);
const ORIGINAL_KEY = process.env.CERT_ENCRYPTION_KEY;

beforeAll(async () => {
  sq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  initSqlModels();
  await sq.sync({ force: true });
  await SystemConfigRepository.ensure();
});

afterAll(async () => {
  if (ORIGINAL_KEY === undefined) delete process.env.CERT_ENCRYPTION_KEY;
  else process.env.CERT_ENCRYPTION_KEY = ORIGINAL_KEY;
  await sq.close();
});

async function storePlaintextSecret(value: string) {
  const row = await SqlSystemConfig.findOne();
  const auth = JSON.parse(row!.auth);
  auth.githubOAuth = { ...auth.githubOAuth, clientSecret: value };
  row!.auth = JSON.stringify(auth);
  await row!.save();
  systemConfigCache.delete('global');
}

async function rawSecret(): Promise<string> {
  const row = await SqlSystemConfig.findOne();
  return JSON.parse(row!.auth).githubOAuth.clientSecret;
}

describe('sealing stored credentials', () => {
  it('does nothing without a key', async () => {
    delete process.env.CERT_ENCRYPTION_KEY;
    await storePlaintextSecret('plain-secret');
    await sealSystemConfig(sq.getQueryInterface());
    expect(await rawSecret()).toBe('plain-secret');
  });

  it('seals plaintext once a key exists, and the value still reads back', async () => {
    process.env.CERT_ENCRYPTION_KEY = KEY_A;
    await storePlaintextSecret('plain-secret');
    await sealPendingSecrets();
    expect((await rawSecret()).startsWith('v1.gcm.')).toBe(true);
    systemConfigCache.delete('global');
    const cfg = await SystemConfigRepository.getConfig();
    expect(cfg!.auth.githubOAuth!.clientSecret).toBe('plain-secret');
  });

  it('a wrong key leaves the stored ciphertext untouched instead of blanking it', async () => {
    process.env.CERT_ENCRYPTION_KEY = KEY_A;
    await storePlaintextSecret('plain-secret');
    await sealPendingSecrets();
    const sealed = await rawSecret();

    process.env.CERT_ENCRYPTION_KEY = KEY_B;
    await sealPendingSecrets();
    await sealPendingSecrets();
    expect(await rawSecret()).toBe(sealed);

    // And the right key still recovers it.
    process.env.CERT_ENCRYPTION_KEY = KEY_A;
    systemConfigCache.delete('global');
    const cfg = await SystemConfigRepository.getConfig();
    expect(cfg!.auth.githubOAuth!.clientSecret).toBe('plain-secret');
  });
});

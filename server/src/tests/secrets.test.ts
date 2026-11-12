// utils/secrets.ts reads the environment at call time, so each case sets what it needs.
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.JWT_SECRET;
  delete process.env.CERT_ENCRYPTION_KEY;
  jest.resetModules();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function load() {
  return require('../utils/secrets') as typeof import('../utils/secrets');
}

describe('secrets — values', () => {
  it('reads both values from the environment only', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.CERT_ENCRYPTION_KEY = 'b'.repeat(64);
    const secrets = load();
    expect(secrets.getJwtSecret()).toBe('a'.repeat(64));
    expect(secrets.getCertKey()).toBe('b'.repeat(64));
  });

  it('returns null when a value is not set', () => {
    const secrets = load();
    expect(secrets.getJwtSecret()).toBeNull();
    expect(secrets.getCertKey()).toBeNull();
  });

  it('reports configured status as booleans without exposing values', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    const status = load().secretStatus();
    expect(status).toEqual({ JWT_SECRET: true, CERT_ENCRYPTION_KEY: false });
  });
});

describe('secrets — environment checks', () => {
  it('rejects a known placeholder JWT secret', () => {
    process.env.JWT_SECRET = 'change_me_in_production';
    expect(() => load().checkEnvSecrets()).toThrow(/placeholder|leaked/i);
  });

  it('rejects a short JWT secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(31);
    expect(() => load().checkEnvSecrets()).toThrow(/at least 32/i);
  });

  it('accepts a 64-character JWT secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(64);
    expect(() => load().checkEnvSecrets()).not.toThrow();
  });

  it('rejects a certificate key that is not 64 hex characters', () => {
    process.env.CERT_ENCRYPTION_KEY = 'not-hex';
    expect(() => load().checkEnvSecrets()).toThrow(/64-character hex/i);
  });

  it('does not treat a missing value as an error', () => {
    expect(() => load().checkEnvSecrets()).not.toThrow();
  });
});

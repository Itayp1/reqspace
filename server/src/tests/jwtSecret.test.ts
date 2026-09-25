// resolveJwtSecret() memoises into a module-level `cached`, so every case has to
// reload the module. jwtSecret.ts also imports 'dotenv/config', which may have
// already populated JWT_SECRET from server/.env — each case therefore sets the
// value explicitly instead of relying on the ambient environment.
describe('resolveJwtSecret', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function load(): () => string {
    return require('../utils/jwtSecret').resolveJwtSecret;
  }

  const leaked = [
    'change_me_in_production', // was committed to k8s/secret.yaml
    'change_me_in_production_very_long_secret_key',
    'changeme',
    'changeme123',
    'secret',
    'jwt_secret',
    'your-secret-key',
  ];

  it.each(leaked)('refuses the known-insecure value %p', (value) => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = value;
    expect(() => load()()).toThrow(/placeholder|leaked/i);
  });

  it('refuses a short secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(31);
    expect(() => load()()).toThrow(/at least 32/i);
  });

  it('accepts a 64-character secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(64);
    expect(load()()).toHaveLength(64);
  });

  it('allows a short secret outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'short_but_fine_in_dev';
    expect(load()()).toBe('short_but_fine_in_dev');
  });

  it('memoises — a second call does not re-read the environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'first_value_long_enough_for_dev';
    const resolve = load();
    expect(resolve()).toBe('first_value_long_enough_for_dev');
    process.env.JWT_SECRET = 'second_value_that_should_be_ignored';
    expect(resolve()).toBe('first_value_long_enough_for_dev');
  });
});

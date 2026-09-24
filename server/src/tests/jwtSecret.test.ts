/**
 * SEC-1 — JWT secret resolution must never accept a known placeholder value,
 * and must require a long-enough secret in production.
 *
 * Each test re-requires the module fresh (jest.resetModules) so the
 * memoised `cached` value from a previous test never leaks across cases.
 */

const ORIGINAL_ENV = { ...process.env };

function loadModule() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../utils/jwtSecret') as typeof import('../utils/jwtSecret');
}

describe('resolveJwtSecret', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws for the k8s/secret.yaml placeholder value, in any environment', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'change_me_in_production';
    const { resolveJwtSecret } = loadModule();
    expect(() => resolveJwtSecret()).toThrow(/known placeholder/i);
  });

  it('throws for the k8s placeholder even in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'change_me_in_production';
    const { resolveJwtSecret } = loadModule();
    expect(() => resolveJwtSecret()).toThrow(/known placeholder/i);
  });

  it('throws for other known-insecure values', () => {
    for (const bad of ['changeme', 'secret', 'jwt_secret', 'your-secret-key']) {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = bad;
      const { resolveJwtSecret } = loadModule();
      expect(() => resolveJwtSecret()).toThrow(/known placeholder/i);
    }
  });

  it('throws in production for a secret shorter than 32 characters', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(20);
    const { resolveJwtSecret } = loadModule();
    expect(() => resolveJwtSecret()).toThrow(/at least 32 characters/i);
  });

  it('accepts a short secret outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'a'.repeat(20);
    const { resolveJwtSecret } = loadModule();
    expect(resolveJwtSecret()).toBe('a'.repeat(20));
  });

  it('succeeds in production for a 64-character secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'b'.repeat(64);
    const { resolveJwtSecret } = loadModule();
    expect(resolveJwtSecret()).toBe('b'.repeat(64));
  });

  it('refuses to boot in production with no JWT_SECRET at all', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.ALLOW_EPHEMERAL_JWT_SECRET;
    const { resolveJwtSecret } = loadModule();
    expect(() => resolveJwtSecret()).toThrow(/must be set to a strong, shared value/i);
  });

  it('generates an ephemeral secret outside production with no JWT_SECRET', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const { resolveJwtSecret } = loadModule();
    const secret = resolveJwtSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);
    // Memoised — calling again in the same module instance returns the same value.
    expect(resolveJwtSecret()).toBe(secret);
  });
});

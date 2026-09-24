import { decryptSecret, encryptSecret, isSealed } from '../utils/secretAtRest';

describe('secretAtRest', () => {
  const previous = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-secret-at-rest-value';
  });
  afterAll(() => {
    process.env.JWT_SECRET = previous;
  });

  it('round-trips a private key and leaves legacy plaintext readable', () => {
    const sealed = encryptSecret('-----BEGIN PRIVATE KEY-----\nabc');
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain('PRIVATE KEY');
    expect(decryptSecret(sealed)).toBe('-----BEGIN PRIVATE KEY-----\nabc');
    expect(decryptSecret('already-plain')).toBe('already-plain');
    expect(encryptSecret(sealed)).toBe(sealed);
  });
});

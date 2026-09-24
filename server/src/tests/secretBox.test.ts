import { decryptSecret, encryptSecret, openCertificates, publicCertificates, sealCertificates } from '../utils/secretBox';

describe('secretBox', () => {
  const pem = '-----BEGIN PRIVATE KEY-----\nsecret-material\n-----END PRIVATE KEY-----';

  it('round-trips a secret and does not store the plaintext', () => {
    const sealed = encryptSecret(pem);
    expect(sealed.startsWith('enc.v1.')).toBe(true);
    expect(sealed).not.toContain('secret-material');
    expect(decryptSecret(sealed)).toBe(pem);
  });

  it('leaves legacy plaintext readable', () => {
    expect(decryptSecret(pem)).toBe(pem);
  });

  it('seals certificate material at rest and redacts it for API responses', () => {
    const stored = sealCertificates([{ _id: '1', hostname: 'api.example', cert: 'CERT', key: pem, passphrase: 'pw' }])!;
    expect(stored[0].key).not.toContain('secret-material');
    expect(stored[0].passphrase).not.toBe('pw');
    const opened = openCertificates(stored);
    expect(opened[0].key).toBe(pem);
    expect(opened[0].passphrase).toBe('pw');
    expect(publicCertificates(opened)).toEqual([
      { _id: '1', hostname: 'api.example', createdAt: undefined },
    ]);
  });
});
import { awsV4Authorization, digestAuthorization, edgeGridAuthorization, graphqlBody, hawkAuthorization, ntlmType1, oauth1Authorization } from '../features/schemes';
import { toJUnit, scanSecrets } from '../features/reports';
import { totpCode, verifyTotp } from '../features/totp';

describe('auth schemes', () => {
  it('builds a digest header with a stable response when nonce and qop are absent', () => {
    const header = digestAuthorization({
      username: 'user', password: 'pass', method: 'GET', uri: '/private', realm: 'api', nonce: 'abc',
    });
    expect(header.startsWith('Digest username="user"')).toBe(true);
    expect(header).toContain('realm="api"');
    expect(header).toContain('response="');
  });

  it('signs oauth1 with HMAC-SHA1', () => {
    const header = oauth1Authorization({
      consumerKey: 'ck', consumerSecret: 'cs', method: 'POST', url: 'https://api.example.com/resource',
    });
    expect(header.startsWith('OAuth ')).toBe(true);
    expect(header).toContain('oauth_signature=');
  });

  it('signs aws v4 deterministically for a fixed clock', () => {
    const signed = awsV4Authorization({
      accessKeyId: 'AKID',
      secretAccessKey: 'secret',
      region: 'us-east-1',
      service: 's3',
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      now: new Date('2013-05-24T00:00:00.000Z'),
    });
    expect(signed.authorization).toContain('AWS4-HMAC-SHA256 Credential=AKID/20130524/us-east-1/s3/aws4_request');
    expect(signed.amzDate).toBe('20130524T000000Z');
    expect(signed.payloadHash).toHaveLength(64);
  });

  it('builds hawk and edgegrid headers', () => {
    expect(hawkAuthorization({ id: 'user', key: 'secret', method: 'GET', url: 'https://example.com/path', now: 1 })).toContain('Hawk id="user"');
    expect(edgeGridAuthorization({
      clientToken: 'ct', clientSecret: 'cs', accessToken: 'at', method: 'GET', url: 'https://example.com/path', now: new Date('2020-01-01T00:00:00.000Z'),
    })).toContain('EG1-HMAC-SHA256');
    expect(ntlmType1('DOMAIN', 'WORK')).toMatch(/^TlRMTVNTUAAB/);
  });

  it('formats junit, scans secrets, and checks totp', () => {
    expect(toJUnit('suite', [{ name: 'ok', passed: true }])).toContain('failures="0"');
    expect(scanSecrets('token AKIAIOSFODNN7EXAMPLE')).toHaveLength(1);
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const totpSecret = Buffer.from('12345678901234567890').toString('base64url');
    expect(verifyTotp(totpSecret, totpCode(totpSecret, 1_000_000), 1_000_000)).toBe(true);
    expect(secret).toContain('GEZD');
  });

  it('wraps a graphql query and variables', () => {
    const body = graphqlBody('query { hello }', { id: 1 });
    expect(JSON.parse(body)).toEqual({ query: 'query { hello }', variables: { id: 1 } });
  });
});

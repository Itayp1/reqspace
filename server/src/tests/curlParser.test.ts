import { parseCurl } from '../utils/curlParser';

describe('parseCurl', () => {
  it('parses method, headers and JSON body', () => {
    const r = parseCurl(`curl -X POST https://a.test/x -H "A: b" -d '{"x":1}'`);
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://a.test/x');
    expect(r.headers).toEqual([{ key: 'A', value: 'b', enabled: true }]);
    expect(r.body).toMatchObject({ mode: 'raw', raw: '{"x":1}', rawLanguage: 'json' });
  });

  it.each(['--data-raw', '--data-binary', '--json', '-d'])('%s implies POST', (flag) => {
    expect(parseCurl(`curl ${flag} 'x=1' https://a.test/r`).method).toBe('POST');
  });

  it('reads --request and a scheme-less URL', () => {
    const r = parseCurl('curl --request DELETE api.test/del');
    expect(r.method).toBe('DELETE');
    expect(r.url).toBe('http://api.test/del');
  });

  it('turns -u into basic auth', () => {
    const r = parseCurl('curl -u user:p:ass https://a.test/b');
    expect(r.auth).toEqual({ type: 'basic', basic: { username: 'user', password: 'p:ass' } });
  });

  it('parses -F text and file fields as form-data', () => {
    const r = parseCurl('curl -F "name=x" -F "file=@./a.png" https://a.test/up');
    expect(r.method).toBe('POST');
    expect(r.body.mode).toBe('form-data');
    expect(r.body.formData).toEqual([
      { key: 'name', value: 'x', enabled: true, type: 'text' },
      { key: 'file', value: '', enabled: true, type: 'file' },
    ]);
  });

  it('handles cookie, user-agent, -G, -I, --url and ignored flags', () => {
    const r = parseCurl(`curl -sSLk --compressed -b 'a=1' -A 'ua' -G --data-urlencode 'q=a b' --url https://a.test/s`);
    expect(r.method).toBe('GET');
    expect(r.url).toBe('https://a.test/s?q=a%20b');
    expect(r.headers.map(h => h.key)).toEqual(['Cookie', 'User-Agent']);
    expect(parseCurl('curl -I https://a.test').method).toBe('HEAD');
  });

  it('never evaluates command substitution', () => {
    const r = parseCurl(`curl https://a.test -d '$(rm -rf /)'`);
    expect(r.body.raw).toBe('$(rm -rf /)');
  });

  it('joins line continuations', () => {
    const r = parseCurl('curl https://a.test \\\n  -H "X: 1"');
    expect(r.headers).toHaveLength(1);
  });
});
